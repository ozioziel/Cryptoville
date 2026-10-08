import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { formatoUsdc, puedeHacer, siguienteEstado, type RolEnPedido } from '@cryptoville/shared';
import { randomInt } from 'node:crypto';
import { AvisosService } from '../avisos/avisos.service';
import { Prisma, type Pedido, type Usuario } from '../generated/prisma/client';
import { KycService } from '../kyc/kyc.module';
import { ModeracionService } from '../moderacion/moderacion.module';
import { PrismaService } from '../prisma/prisma.service';
import { walletParaCobrar } from '../wallets/wallets.module';

const HORA = 3_600_000;
const DIA = 24 * HORA;

export type PedidoCompleto = Prisma.PedidoGetPayload<{
  include: { servicio: true; cliente: true; proveedor: true; disputa: true };
}>;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly avisos: AvisosService,
    private readonly kyc: KycService,
    private readonly moderacion: ModeracionService,
  ) {}

  /** Rol del usuario en el pedido: cliente, proveedor, árbitro (si no participa) o null. */
  rolEn(pedido: Pick<Pedido, 'cliente_id' | 'proveedor_id'>, usuario: Usuario): RolEnPedido | null {
    if (pedido.cliente_id === usuario.id) return 'cliente';
    if (pedido.proveedor_id === usuario.id) return 'proveedor';
    if (usuario.rol === 'arbitro') return 'arbitro';
    return null;
  }

  async cargar(id: string): Promise<PedidoCompleto> {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id },
      include: { servicio: true, cliente: true, proveedor: true, disputa: true },
    });
    if (!pedido) throw new NotFoundException('No existe ese pedido');
    return pedido;
  }

  /** Carga el pedido y exige que el usuario participe (o sea árbitro). */
  async cargarVisible(id: string, usuario: Usuario): Promise<{ pedido: PedidoCompleto; rol: RolEnPedido }> {
    const pedido = await this.cargar(id);
    const rol = this.rolEn(pedido, usuario);
    if (!rol) throw new ForbiddenException('No participas en este pedido');
    return { pedido, rol };
  }

  /** `metodo` y `contrato`: cómo se paga y en qué contrato (los decide PagosService). */
  async crear(cliente: Usuario, servicioId: string, detalle: string, pago: { metodo: string; contrato: string } = { metodo: 'garantia', contrato: 'v1' }) {
    const servicio = await this.prisma.servicio.findUnique({ where: { id: servicioId }, include: { local: true } });
    if (!servicio || !servicio.activo || !servicio.local.activo) {
      throw new NotFoundException('Ese servicio no está disponible');
    }
    if (servicio.local.usuario_id === cliente.id) throw new BadRequestException('No puedes contratar tu propio servicio');
    await this.moderacion.exigirSinBloqueo(cliente.id, servicio.local.usuario_id);

    for (let intento = 0; intento < 5; intento++) {
      try {
        const pedido = await this.prisma.pedido.create({
          data: {
            numero: nuevoNumero(),
            servicio_id: servicio.id,
            cliente_id: cliente.id,
            proveedor_id: servicio.local.usuario_id,
            monto_usdc: servicio.precio_usdc,
            detalle: detalle.trim(),
            metodo_pago: pago.metodo,
            contrato: pago.contrato,
          },
        });
        await this.avisos.crear(
          pedido.proveedor_id,
          'nuevo_pedido',
          `${cliente.nombre} quiere contratar «${servicio.titulo}». Revisa el pedido y acéptalo.`,
          pedido.id,
        );
        return pedido;
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      }
    }
    throw new ConflictException('No se pudo crear el pedido, intenta de nuevo');
  }

  /** El proveedor acepta: fija el precio final y la fecha límite de entrega. */
  async aceptar(usuario: Usuario, id: string, fechaLimite: Date, montoUsdc?: string) {
    const { pedido, rol } = await this.cargarVisible(id, usuario);
    this.exigirPermiso('aceptar', pedido, rol);
    // Aceptar un pedido es para cobrarlo: exige el KYC (si está encendido).
    this.kyc.exigir(usuario, 'cobrar');
    const ahora = Date.now();
    if (fechaLimite.getTime() < ahora + HORA || fechaLimite.getTime() > ahora + 90 * DIA) {
      throw new BadRequestException('La fecha límite debe ser entre 1 hora y 90 días desde ahora');
    }
    const actualizado = await this.moverEstado(pedido, 'aceptar', {
      fecha_limite: fechaLimite,
      ...(montoUsdc ? { monto_usdc: montoUsdc } : {}),
      // El proveedor cobra en su wallet "para cobrar" (queda fija en el pedido).
      direccion_proveedor: await walletParaCobrar(this.prisma, pedido.proveedor),
    });
    await this.prisma.pasoPedido.create({ data: { pedido_id: id, accion: 'aceptar', declarado_por: usuario.id } });
    await this.avisos.crear(
      pedido.cliente_id,
      'te_toca_pagar',
      `${pedido.proveedor.nombre} aceptó tu pedido por ${formatoUsdc(String(actualizado.monto_usdc))} USDC. ` +
        (pedido.metodo_pago === 'directo' ? 'Págale directo para que empiece.' : 'Paga en garantía para que empiece.'),
      id,
    );
    return actualizado;
  }

  async cancelar(usuario: Usuario, id: string) {
    const { pedido, rol } = await this.cargarVisible(id, usuario);
    this.exigirPermiso('cancelar', pedido, rol);
    const actualizado = await this.moverEstado(pedido, 'cancelar');
    await this.prisma.pasoPedido.create({ data: { pedido_id: id, accion: 'cancelar', declarado_por: usuario.id } });
    const otro = rol === 'cliente' ? pedido.proveedor_id : pedido.cliente_id;
    await this.avisos.crear(otro, 'pedido_cerrado', `${usuario.nombre} canceló el pedido #${pedido.numero}.`, id);
    return actualizado;
  }

  exigirPermiso(accion: Parameters<typeof puedeHacer>[0], pedido: Pedido, rol: RolEnPedido): void {
    if (!puedeHacer(accion, pedido.estado, rol)) {
      throw new ForbiddenException(`No puedes hacer "${accion}" en un pedido "${pedido.estado}" como ${rol}`);
    }
  }

  /**
   * Cambia el estado de forma segura: solo si nadie lo cambió mientras tanto
   * (actualización condicionada al estado actual).
   */
  async moverEstado(
    pedido: Pedido,
    accion: Parameters<typeof siguienteEstado>[1],
    extra: Prisma.PedidoUpdateManyMutationInput = {},
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<Pedido> {
    const hacia = siguienteEstado(pedido.estado, accion);
    const r = await tx.pedido.updateMany({
      where: { id: pedido.id, estado: pedido.estado },
      data: { ...extra, estado: hacia },
    });
    if (r.count !== 1) throw new ConflictException('El pedido cambió mientras tanto; recarga y vuelve a intentar');
    return tx.pedido.findUniqueOrThrow({ where: { id: pedido.id } });
  }
}

/** Número del pedido en el contrato (u64): segundos Unix × 1000 + 3 cifras al azar. Cabe en 2^53. */
export function nuevoNumero(): bigint {
  return BigInt(Math.floor(Date.now() / 1000)) * 1000n + BigInt(randomInt(1000));
}
