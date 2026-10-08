import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { FUNCIONES_V2, type FuncionV2 } from '@cryptoville/shared';
import { rpc, scValToNative } from '@stellar/stellar-sdk';
import { CONFIGURACION, type Configuracion } from '../config/configuracion';
import { Prisma } from '../generated/prisma/client';
import { RecordatoriosService } from '../notificaciones/recordatorios.module';
import { POSICION_FASE } from '../pagos/cadena-v2';
import { PagosService } from '../pagos/pagos.service';
import { PrismaService } from '../prisma/prisma.service';
import { arg, invocacionDeSobre } from '../stellar/cadena';
import { ContratoV2Service } from '../stellar/contrato-v2.service';
import { StellarService } from '../stellar/stellar.service';
import { SincronizadorService } from './sincronizador.service';

const DIA = 86_400_000;
/** Vencimientos que ejecuta la llave de mantenimiento por ciclo (para no gastar de más). */
const MAX_POR_CICLO = 5;
/** Cada cuánto se renueva un pedido en curso para que sus datos no caduquen en la red. */
const RENOVAR_CADA_DIAS = 20;

/**
 * Mantenimiento del contrato v2 (se suma al ciclo del sincronizador):
 * 1. Lee los eventos del contrato y pone al día los pedidos (aunque alguien haya actuado desde Stellar Lab).
 * 2. Con la llave de mantenimiento (opcional), ejecuta los vencimientos: el contrato manda el dinero a quien
 *    corresponde, así nadie pierde por no haber entrado a tiempo.
 * 3. Renueva los pedidos en curso (`extender`) para que sus datos no caduquen.
 * 4. Pago directo: si el cliente no confirma en el plazo de revisión, el pedido se da por terminado.
 * También suma los recordatorios de las fases (vence la entrega, vence la revisión).
 */
@Injectable()
export class MantenimientoV2Service implements OnModuleInit {
  private readonly log = new Logger('Mantenimiento');

  constructor(
    private readonly prisma: PrismaService,
    private readonly stellar: StellarService,
    private readonly contratoV2: ContratoV2Service,
    private readonly pagos: PagosService,
    private readonly sincronizador: SincronizadorService,
    private readonly recordatorios: RecordatoriosService,
    @Inject(CONFIGURACION) private readonly config: Configuracion,
  ) {}

  onModuleInit(): void {
    this.recordatorios.agregar({ pendientes: (desde, hasta) => this.recordatoriosDeFases(desde, hasta) });
    if (!this.config.stellar.contratoV2Id) return;
    this.sincronizador.agregar({ sincronizar: () => this.ciclo() });
  }

  async ciclo(): Promise<void> {
    const contrato = this.config.stellar.contratoV2Id;
    if (!contrato) return;
    await this.sincronizador.recorrerEventos(`escrow-v2:${contrato}`, contrato, (e) => this.aplicarEvento(e));
    await this.vencimientos(contrato);
    await this.renovar(contrato);
    await this.cerrarDirectos();
  }

  private async aplicarEvento(evento: rpc.Api.EventResponse): Promise<void> {
    const nombre = scValToNative(evento.topic[0]);
    if (!['pedido_creado', 'fase_cambio', 'pago_directo'].includes(String(nombre)) || evento.topic.length < 2) return;
    const numero = BigInt(scValToNative(evento.topic[1]) as bigint);
    const fila = await this.prisma.pedido.findUnique({ where: { numero }, select: { id: true, contrato: true, es_ejemplo: true } });
    if (!fila || fila.contrato !== 'v2' || fila.es_ejemplo) return;
    if (await this.prisma.pasoPedido.findUnique({ where: { hash: evento.txHash } })) return;
    const confirmada = await this.stellar.esperar(evento.txHash, 1);
    if (confirmada.status !== rpc.Api.GetTransactionStatus.SUCCESS) return;
    const inv = invocacionDeSobre(confirmada.envelopeXdr, this.stellar.passphrase);
    const funcion = inv?.funcion as FuncionV2 | undefined;
    if (!inv || !funcion || !FUNCIONES_V2.includes(funcion) || funcion === 'extender') return;
    const posicion = POSICION_FASE[funcion];
    try {
      await this.pagos.registrarV2(null, fila.id, { funcion, fase: posicion === undefined ? undefined : Number(inv.args[posicion]) }, confirmada);
      this.log.log(`Pedido #${numero}: se registró "${funcion}" hecho directo en el contrato`);
    } catch (e) {
      // Aunque el paso no se pueda registrar, las fases quedan igual que en el contrato.
      this.log.warn(`Pedido #${numero}: "${funcion}" no se registró (${String((e as Error).message).slice(0, 140)}); se sincroniza el estado`);
      await this.pagos.sincronizar(fila.id).catch(() => undefined);
    }
  }

  /** Vencimientos que ya se pueden ejecutar (solo con la llave de mantenimiento). */
  private async vencimientos(contrato: string): Promise<void> {
    if (!this.config.stellar.llaveMantenimiento) return;
    const plazos = this.contratoV2.plazos;
    const ahora = Date.now();
    const pendientes = await this.prisma.fase.findMany({
      where: {
        pedido: { contrato: 'v2', es_ejemplo: false },
        OR: [
          { estado: 'entregada', entregada_en: { lt: new Date(ahora - plazos.revisionSeg * 1000) } },
          { estado: 'en_curso', fecha_limite: { lt: new Date(ahora) } },
          { estado: 'en_disputa', disputa_desde: { lt: new Date(ahora - plazos.disputaSeg * 1000) } },
        ],
      },
      include: { pedido: { select: { id: true, numero: true } } },
      orderBy: { actualizado_en: 'asc' },
      take: MAX_POR_CICLO,
    });
    for (const f of pendientes) {
      const funcion: FuncionV2 = f.estado === 'entregada' ? 'cobrar_por_vencimiento' : f.estado === 'en_curso' ? 'reembolsar_por_vencimiento' : 'resolver_por_vencimiento';
      try {
        const confirmada = await this.stellar.firmarMantenimiento(contrato, funcion, [arg.u64(String(f.pedido.numero)), arg.u32(f.numero)]);
        if (confirmada) await this.pagos.registrarV2(null, f.pedido.id, { funcion, fase: f.numero }, confirmada);
        this.log.log(`Pedido #${f.pedido.numero}: se ejecutó "${funcion}" en la fase ${f.numero + 1}`);
      } catch (e) {
        // Por ejemplo, una fase anterior en disputa: se vuelve a intentar en otro ciclo.
        this.log.warn(`Pedido #${f.pedido.numero}: no se pudo ejecutar "${funcion}" (${String((e as Error).message).slice(0, 140)})`);
        await this.pagos.sincronizar(f.pedido.id).catch(() => undefined);
      }
    }
  }

  /** Renueva cada cierto tiempo los pedidos en curso, para que sus datos no caduquen en la red. */
  private async renovar(contrato: string): Promise<void> {
    if (!this.config.stellar.llaveMantenimiento) return;
    const ventana = Math.floor(Date.now() / (RENOVAR_CADA_DIAS * DIA));
    const activos = await this.prisma.pedido.findMany({
      where: { contrato: 'v2', metodo_pago: { not: 'directo' }, estado: { in: ['pagado', 'entregado', 'en_disputa'] }, es_ejemplo: false },
      select: { id: true, numero: true },
      take: 50,
    });
    let hechos = 0;
    for (const p of activos) {
      if (hechos >= MAX_POR_CICLO) return;
      try {
        await this.prisma.recordatorio.create({ data: { clave: `renovar:${p.id}:${ventana}` } });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
        throw e;
      }
      try {
        await this.stellar.firmarMantenimiento(contrato, 'extender', [arg.u64(String(p.numero))]);
        hechos++;
      } catch (e) {
        this.log.warn(`Pedido #${p.numero}: no se pudo renovar (${String((e as Error).message).slice(0, 140)})`);
      }
    }
  }

  /** Pago directo: si el cliente no confirma la entrega en el plazo de revisión, el pedido se da por terminado. */
  private async cerrarDirectos(): Promise<void> {
    const limite = new Date(Date.now() - this.contratoV2.plazos.revisionSeg * 1000);
    const pedidos = await this.prisma.pedido.findMany({
      where: { metodo_pago: 'directo', estado: 'entregado', pasos: { some: { accion: 'marcar_entregado', creado_en: { lt: limite } } } },
      select: { id: true },
      take: 50,
    });
    for (const p of pedidos) await this.prisma.pedido.updateMany({ where: { id: p.id, estado: 'entregado' }, data: { estado: 'finalizado' } });
  }

  /** Recordatorios de las fases: vence la entrega (al proveedor) y vence la revisión (al cliente). */
  async recordatoriosDeFases(desde: Date, hasta: Date) {
    const plazo = this.contratoV2.plazos.revisionSeg * 1000;
    const [entregas, revisiones] = await Promise.all([
      this.prisma.fase.findMany({
        where: { estado: 'en_curso', fecha_limite: { gt: desde, lte: hasta }, pedido: { es_ejemplo: false } },
        include: { pedido: { select: { id: true, numero: true, proveedor_id: true } } },
      }),
      this.prisma.fase.findMany({
        where: { estado: 'entregada', entregada_en: { gt: new Date(desde.getTime() - plazo), lte: new Date(hasta.getTime() - plazo) }, pedido: { es_ejemplo: false } },
        include: { pedido: { select: { id: true, numero: true, cliente_id: true } } },
      }),
    ]);
    return [
      ...entregas.map((f) => ({
        clave: `fase-entrega:${f.id}:${f.fecha_limite.getTime()}`,
        usuarioId: f.pedido.proveedor_id,
        texto: `Mañana vence la fase ${f.numero + 1} del pedido #${f.pedido.numero}. Si no la entregas, el cliente puede recuperar ese dinero.`,
        pedidoId: f.pedido.id,
      })),
      ...revisiones.map((f) => ({
        clave: `fase-revision:${f.id}:${f.entregada_en?.getTime()}`,
        usuarioId: f.pedido.cliente_id,
        texto: `Mañana vence tu plazo para revisar la fase ${f.numero + 1} del pedido #${f.pedido.numero}. Si no respondes, el proveedor cobra esa fase.`,
        pedidoId: f.pedido.id,
      })),
    ];
  }
}
