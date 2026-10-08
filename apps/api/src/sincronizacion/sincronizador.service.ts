import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { FUNCION_CONTRATO, type AccionContrato } from '@cryptoville/shared';
import { rpc, scValToNative } from '@stellar/stellar-sdk';
import { CONFIGURACION, type Configuracion } from '../config/configuracion';
import { EscrowService } from '../escrow/escrow.service';
import type { Parte } from '../generated/prisma/client';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { invocacionDeSobre, variante } from '../stellar/cadena';
import { StellarService } from '../stellar/stellar.service';

const CADA_MS = 30_000;
const PAGINAS_POR_CICLO = 5;
const POR_PAGINA = 100;

/** Función del contrato v1 → acción de la app. */
const ACCION_DE_FUNCION = Object.fromEntries(
  Object.entries(FUNCION_CONTRATO).map(([accion, funcion]) => [funcion, accion]),
) as Record<string, AccionContrato>;

/** Ciclos de sincronización extra que agregan otros módulos (por ejemplo, el contrato v2). */
export interface Sincronizable {
  sincronizar(): Promise<void>;
}

/**
 * Sincronización con el contrato: cada 30 segundos lee los eventos nuevos del escrow y pone al día los pedidos.
 * Así, si alguien hizo un paso directo en Stellar Lab (sin pegar el hash en la app), el pedido igual avanza.
 * Cada paso se verifica como cualquier otro antes de registrarlo.
 */
@Injectable()
export class SincronizadorService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('Sincronizador');
  private temporizador: NodeJS.Timeout | null = null;
  private ocupado = false;
  private readonly extras: Sincronizable[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly stellar: StellarService,
    private readonly orders: OrdersService,
    private readonly escrow: EscrowService,
    @Inject(CONFIGURACION) private readonly config: Configuracion,
  ) {}

  get activo(): boolean {
    return this.config.entorno !== 'test' && this.stellar.verifica;
  }

  /** Suma otro ciclo (lo usan el contrato v2 y la llave de mantenimiento). */
  agregar(extra: Sincronizable): void {
    this.extras.push(extra);
  }

  onApplicationBootstrap(): void {
    if (!this.activo) return;
    this.temporizador = setInterval(() => void this.ciclo(), CADA_MS);
    this.temporizador.unref();
    void this.ciclo();
  }

  onModuleDestroy(): void {
    if (this.temporizador) clearInterval(this.temporizador);
  }

  async ciclo(): Promise<void> {
    if (this.ocupado) return;
    this.ocupado = true;
    try {
      if (this.config.stellar.contratoId) await this.sincronizarV1(this.config.stellar.contratoId);
      for (const extra of this.extras) await extra.sincronizar();
    } catch (e) {
      this.log.warn(`No se pudo sincronizar con el contrato: ${String((e as Error).message).slice(0, 200)}`);
    } finally {
      this.ocupado = false;
    }
  }

  /** Recorre los eventos de un contrato desde donde quedó la última vez. */
  async recorrerEventos(clave: string, contrato: string, aplicar: (e: rpc.Api.EventResponse) => Promise<void>): Promise<void> {
    const guardado = await this.prisma.sincronizacionCadena.findUnique({ where: { clave } });
    // La primera vez se empieza desde ahora (lo anterior lo registraron las personas con su hash).
    let desde: { cursor: string } | { ledger: number } = guardado?.cursor
      ? { cursor: guardado.cursor }
      : { ledger: guardado?.ledger ?? (await this.stellar.ultimoLedger()) };
    for (let pagina = 0; pagina < PAGINAS_POR_CICLO; pagina++) {
      let r: rpc.Api.GetEventsResponse;
      try {
        r = await this.stellar.eventos(contrato, desde, POR_PAGINA);
      } catch (e) {
        // El cursor es más viejo de lo que guarda la red: se vuelve a empezar desde el último ledger.
        if ('cursor' in desde) {
          desde = { ledger: await this.stellar.ultimoLedger() };
          continue;
        }
        throw e;
      }
      for (const evento of r.events) {
        if (!evento.inSuccessfulContractCall) continue;
        try {
          await aplicar(evento);
        } catch (e) {
          this.log.warn(`Evento ${evento.id} sin aplicar: ${String((e as Error).message).slice(0, 160)}`);
        }
      }
      await this.prisma.sincronizacionCadena.upsert({
        where: { clave },
        update: { cursor: r.cursor, ledger: r.latestLedger },
        create: { clave, cursor: r.cursor, ledger: r.latestLedger },
      });
      if (r.events.length < POR_PAGINA) return;
      desde = { cursor: r.cursor };
    }
  }

  private async sincronizarV1(contrato: string): Promise<void> {
    await this.recorrerEventos(`escrow-v1:${contrato}`, contrato, (e) => this.aplicarV1(e));
  }

  private async aplicarV1(evento: rpc.Api.EventResponse): Promise<void> {
    if (scValToNative(evento.topic[0]) !== 'evento_pedido' || evento.topic.length < 2) return;
    const numero = BigInt(scValToNative(evento.topic[1]) as bigint);
    if (await this.prisma.pasoPedido.findUnique({ where: { hash: evento.txHash } })) return;
    const fila = await this.prisma.pedido.findUnique({ where: { numero }, select: { id: true, es_ejemplo: true } });
    if (!fila || fila.es_ejemplo) return;

    const confirmada = await this.stellar.esperar(evento.txHash, 1);
    if (confirmada.status !== rpc.Api.GetTransactionStatus.SUCCESS) return;
    const inv = invocacionDeSobre(confirmada.envelopeXdr, this.stellar.passphrase);
    const accion = inv ? ACCION_DE_FUNCION[inv.funcion] : undefined;
    if (!inv || !accion) return;
    const pedido = await this.orders.cargar(fila.id);
    const quien = typeof inv.args[0] === 'string' ? inv.args[0] : null;
    const aFavorDe = accion === 'resolver' ? ((variante(inv.args[2]) as Parte | null) ?? undefined) : undefined;
    const r = await this.escrow.registrarDesdeCadena(pedido, accion, confirmada, quien, aFavorDe);
    if (r) this.log.log(`Pedido #${numero}: se registró "${accion}" hecho directo en el contrato`);
  }
}
