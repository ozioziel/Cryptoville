import { Inject, Injectable, Logger, Module, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { reglasDe } from '@cryptoville/shared';
import { AvisosService } from '../avisos/avisos.service';
import { CONFIGURACION, type Configuracion } from '../config/configuracion';
import { Prisma, type TipoAviso } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const CADA_MS = 10 * 60_000;

/** Algo que puede necesitar un recordatorio (otros módulos suman los suyos, por ejemplo las fases). */
export interface FuenteRecordatorios {
  pendientes(desde: Date, hasta: Date): Promise<{ clave: string; usuarioId: string; texto: string; pedidoId: string }[]>;
}

/**
 * Recordatorios de plazos que mueven dinero: los plazos vencen solos (y el contrato actúa solo),
 * así que se avisa un día antes por la campana, el navegador y el correo.
 * - Al proveedor: vence la fecha de entrega.
 * - Al cliente: vence su plazo de revisión (si no responde, el proveedor cobra).
 * - Al cliente: el pedido aceptado todavía no está pagado y se acerca la fecha.
 */
@Injectable()
export class RecordatoriosService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('Recordatorios');
  private temporizador: NodeJS.Timeout | null = null;
  private readonly fuentes: FuenteRecordatorios[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly avisos: AvisosService,
    @Inject(CONFIGURACION) private readonly config: Configuracion,
  ) {}

  agregar(fuente: FuenteRecordatorios): void {
    this.fuentes.push(fuente);
  }

  onApplicationBootstrap(): void {
    if (this.config.entorno === 'test') return;
    this.temporizador = setInterval(() => void this.revisar(), CADA_MS);
    this.temporizador.unref();
    setTimeout(() => void this.revisar(), 15_000).unref();
  }

  onModuleDestroy(): void {
    if (this.temporizador) clearInterval(this.temporizador);
  }

  async revisar(ahora = new Date()): Promise<number> {
    const reglas = reglasDe(this.config.stellar.red);
    const hasta = new Date(ahora.getTime() + reglas.plazos.avisoVencimientoSeg * 1000);
    let enviados = 0;
    try {
      // Pedidos del contrato v1 (los del v2 avisan por fase, ver MantenimientoV2Service).
      const entregas = await this.prisma.pedido.findMany({
        where: { estado: 'pagado', contrato: 'v1', es_ejemplo: false, fecha_limite: { gt: ahora, lte: hasta } },
        select: { id: true, numero: true, proveedor_id: true },
      });
      for (const p of entregas) {
        enviados += await this.mandar(`entrega:${p.id}`, p.proveedor_id, 'recordatorio', `Mañana vence la fecha de entrega del pedido #${p.numero}. Si no entregas, el cliente puede recuperar su dinero.`, p.id);
      }

      const sinPagar = await this.prisma.pedido.findMany({
        where: { estado: 'aceptado', es_ejemplo: false, fecha_limite: { gt: ahora, lte: hasta } },
        select: { id: true, numero: true, cliente_id: true },
      });
      for (const p of sinPagar) {
        enviados += await this.mandar(`pago:${p.id}`, p.cliente_id, 'recordatorio', `El pedido #${p.numero} está aceptado pero sin pagar, y su fecha está cerca.`, p.id);
      }

      // Plazo de revisión del cliente: desde que el proveedor marcó la entrega.
      const desde = new Date(ahora.getTime() - this.config.stellar.plazoRevisionSeg * 1000);
      const hastaEntrega = new Date(hasta.getTime() - this.config.stellar.plazoRevisionSeg * 1000);
      const entregados = await this.prisma.pasoPedido.findMany({
        where: { accion: 'marcar_entregado', creado_en: { gt: desde, lte: hastaEntrega }, pedido: { estado: 'entregado', contrato: 'v1', es_ejemplo: false } },
        select: { pedido: { select: { id: true, numero: true, cliente_id: true } } },
      });
      for (const { pedido: p } of entregados) {
        enviados += await this.mandar(`revision:${p.id}`, p.cliente_id, 'recordatorio', `Mañana vence tu plazo para revisar el pedido #${p.numero}. Si no respondes, el proveedor cobra.`, p.id);
      }

      for (const fuente of this.fuentes) {
        for (const r of await fuente.pendientes(ahora, hasta)) enviados += await this.mandar(r.clave, r.usuarioId, 'recordatorio', r.texto, r.pedidoId);
      }
    } catch (e) {
      this.log.warn(`No se pudieron revisar los plazos: ${String((e as Error).message).slice(0, 160)}`);
    }
    return enviados;
  }

  /** Manda el recordatorio una sola vez (la clave queda guardada). */
  private async mandar(clave: string, usuarioId: string, tipo: TipoAviso, texto: string, pedidoId: string): Promise<number> {
    try {
      await this.prisma.recordatorio.create({ data: { clave } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return 0;
      throw e;
    }
    await this.avisos.crear(usuarioId, tipo, texto, pedidoId);
    return 1;
  }
}

@Module({ providers: [RecordatoriosService], exports: [RecordatoriosService] })
export class RecordatoriosModule {}
