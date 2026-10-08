import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ACCIONES, esAccionContrato, esHashValido, formatoUsdc, type AccionContrato } from '@cryptoville/shared';
import { AvisosService } from '../avisos/avisos.service';
import { CONFIGURACION, type Configuracion } from '../config/configuracion';
import type { Parte, TipoAviso, Usuario } from '../generated/prisma/client';
import { OrdersService, type PedidoCompleto } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import type { TransaccionConfirmada } from '../stellar/stellar.service';
import { VerificadorService } from '../stellar/verificador.service';

export interface DeclaracionPaso {
  accion: string;
  hash: string;
  /** Solo para abrir_disputa. */
  motivo?: string;
  /** Solo para resolver. */
  a_favor_de?: Parte;
  decision?: string;
}

/**
 * Pasos del contrato. Se pueden hacer de dos formas:
 * - Firmando dentro de la app (TransaccionesService): la API arma la transacción, la wallet la firma,
 *   la API la envía y registra el paso ya verificado.
 * - En Stellar Lab: quien hizo la transacción pega su hash ("declara" el paso).
 * En los dos casos, si la verificación en la red está encendida (STELLAR_VERIFICAR), la API lee la
 * transacción y la compara con el pedido antes de registrarla; si no coincide, la rechaza.
 * Si está apagada (pruebas automáticas), la otra parte o el árbitro la revisan en el Lab y la verifican.
 * El contrato es quien de verdad protege el dinero; esto solo refleja su estado.
 */
@Injectable()
export class EscrowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly avisos: AvisosService,
    private readonly verificador: VerificadorService,
    @Inject(CONFIGURACION) private readonly config: Configuracion,
  ) {}

  /**
   * Registra un paso hecho en la red.
   * `confirmada`: la transacción que la API acaba de enviar (firmada en la app), para no volver a pedirla.
   */
  async declarar(usuario: Usuario, pedidoId: string, d: DeclaracionPaso, confirmada?: TransaccionConfirmada) {
    if (!esAccionContrato(d.accion as never)) throw new BadRequestException('Esa acción no es un paso del contrato');
    const accion = d.accion as AccionContrato;
    const hash = d.hash.trim().toLowerCase();
    if (!esHashValido(hash)) throw new BadRequestException('El hash debe tener 64 caracteres hexadecimales');

    const { pedido, rol } = await this.orders.cargarVisible(pedidoId, usuario);
    if (pedido.es_ejemplo) throw new BadRequestException('Este es un pedido de ejemplo: no tiene transacciones reales');
    if (pedido.contrato !== 'v1') throw new BadRequestException('Este pedido es del contrato v2: sus pasos van por fase');
    this.orders.exigirPermiso(accion, pedido, rol);
    if (await this.prisma.pasoPedido.findUnique({ where: { hash } })) {
      throw new ConflictException('Ese hash ya se registró en otro paso');
    }
    await this.validarReglas(accion, pedido, usuario, d);

    // Verificación en la red: la transacción tiene que ser exactamente este paso de este pedido.
    const verificado = this.verificador.activo
      ? await this.verificador.verificarPasoV1(pedido, usuario, { accion, hash, a_favor_de: d.a_favor_de }, confirmada)
      : null;
    const direcciones =
      accion === 'crear_pedido' && verificado
        ? {
            direccion_cliente: verificado.direccionCliente ?? pedido.direccion_cliente,
            direccion_proveedor: pedido.direccion_proveedor ?? pedido.proveedor.direccion,
          }
        : {};

    const actualizado = await this.prisma.$transaction(async (tx) => {
      const nuevo = await this.orders.moverEstado(pedido, accion, direcciones, tx);
      await tx.pasoPedido.create({
        data: {
          pedido_id: pedido.id,
          accion,
          hash,
          declarado_por: usuario.id,
          ...(verificado ? { en_cadena: true, ledger: verificado.ledger, verificado_en: new Date() } : {}),
        },
      });
      if (accion === 'abrir_disputa') {
        await tx.disputa.create({
          data: { pedido_id: pedido.id, abierta_por: usuario.id, motivo: d.motivo!.trim() },
        });
      }
      if (accion === 'resolver') {
        await tx.disputa.update({
          where: { pedido_id: pedido.id },
          data: { ganador: d.a_favor_de!, decision: d.decision!.trim(), resuelta_en: new Date() },
        });
      }
      return nuevo;
    });

    await this.notificar(accion, pedido, usuario, d);
    return actualizado;
  }

  /**
   * Registra un paso que alguien hizo directo en el contrato (por ejemplo, desde Stellar Lab sin pegar el hash).
   * Lo llama el sincronizador al leer los eventos del contrato. La transacción se verifica igual que siempre.
   */
  async registrarDesdeCadena(pedido: PedidoCompleto, accion: AccionContrato, confirmada: TransaccionConfirmada, quien: string | null, aFavorDe?: Parte) {
    if (await this.prisma.pasoPedido.findUnique({ where: { hash: confirmada.txHash } })) return null;
    const dir = { cliente: pedido.direccion_cliente ?? pedido.cliente.direccion, proveedor: pedido.direccion_proveedor ?? pedido.proveedor.direccion };
    let declarante: Usuario | null = null;
    if (accion === 'resolver') {
      declarante = await this.prisma.usuario.findFirst({ where: { rol: 'arbitro', NOT: { id: { in: [pedido.cliente_id, pedido.proveedor_id] } } } });
    } else if (accion === 'crear_pedido' || quien === dir.cliente) {
      declarante = pedido.cliente;
    } else if (quien === dir.proveedor) {
      declarante = pedido.proveedor;
    }
    if (!declarante) return null;
    const verificado = await this.verificador.verificarPasoV1(pedido, declarante, { accion, hash: confirmada.txHash, a_favor_de: aFavorDe }, confirmada);
    const motivo = 'Disputa abierta directo en el contrato (Stellar Lab): el motivo no se escribió en la app.';
    const decision = 'Resuelta directo en el contrato (Stellar Lab).';
    const direcciones =
      accion === 'crear_pedido'
        ? { direccion_cliente: verificado.direccionCliente, direccion_proveedor: pedido.direccion_proveedor ?? pedido.proveedor.direccion }
        : {};
    const quienDeclara = declarante;
    const actualizado = await this.prisma.$transaction(async (tx) => {
      const nuevo = await this.orders.moverEstado(pedido, accion, direcciones, tx);
      await tx.pasoPedido.create({
        data: {
          pedido_id: pedido.id,
          accion,
          hash: confirmada.txHash,
          declarado_por: quienDeclara.id,
          en_cadena: true,
          ledger: verificado.ledger,
          verificado_en: new Date(),
        },
      });
      if (accion === 'abrir_disputa') await tx.disputa.create({ data: { pedido_id: pedido.id, abierta_por: quienDeclara.id, motivo } });
      if (accion === 'resolver') {
        await tx.disputa.update({ where: { pedido_id: pedido.id }, data: { ganador: aFavorDe ?? null, decision, resuelta_en: new Date() } });
      }
      return nuevo;
    });
    await this.notificar(accion, pedido, quienDeclara, { accion, hash: confirmada.txHash, motivo, a_favor_de: aFavorDe, decision });
    return actualizado;
  }

  /** La otra parte (o el árbitro) confirma que revisó la transacción en Stellar Lab. */
  async verificar(usuario: Usuario, pedidoId: string, pasoId: string) {
    const { pedido } = await this.orders.cargarVisible(pedidoId, usuario);
    const paso = await this.prisma.pasoPedido.findUnique({ where: { id: pasoId } });
    if (!paso || paso.pedido_id !== pedido.id) throw new NotFoundException('No existe ese paso en el pedido');
    if (!paso.hash) throw new BadRequestException('Ese paso no tiene transacción que verificar');
    if (paso.declarado_por === usuario.id) throw new ForbiddenException('No puedes verificar un paso que declaraste tú');
    if (paso.verificado_por) throw new ConflictException('Ese paso ya fue verificado');
    return this.prisma.pasoPedido.update({
      where: { id: paso.id },
      data: { verificado_por: usuario.id, verificado_en: new Date() },
    });
  }

  /** Reglas de la app que imitan las del contrato, para avisar antes de que falle en el Lab (o al firmar en la app). */
  async validarReglas(accion: AccionContrato, pedido: PedidoCompleto, usuario: Usuario, d: DeclaracionPaso) {
    const ahora = Date.now();
    switch (accion) {
      case 'crear_pedido':
        if (!pedido.fecha_limite || pedido.fecha_limite.getTime() <= ahora) {
          throw new BadRequestException('La fecha límite ya pasó: cancela y vuelve a pedir el servicio');
        }
        break;
      case 'reembolsar_por_vencimiento':
        if (!pedido.fecha_limite || pedido.fecha_limite.getTime() > ahora) {
          throw new BadRequestException('Todavía no vence la fecha límite de entrega');
        }
        break;
      case 'cobrar_por_vencimiento': {
        const entrega = await this.prisma.pasoPedido.findFirst({
          where: { pedido_id: pedido.id, accion: 'marcar_entregado' },
          orderBy: { creado_en: 'desc' },
        });
        const vence = (entrega?.creado_en.getTime() ?? ahora) + this.config.stellar.plazoRevisionSeg * 1000;
        if (vence > ahora) throw new BadRequestException('Todavía no vence el plazo de revisión del cliente');
        break;
      }
      case 'abrir_disputa':
        if (!d.motivo || d.motivo.trim().length < 10) {
          throw new BadRequestException('Explica el motivo de la disputa (al menos 10 caracteres)');
        }
        break;
      case 'resolver':
        if (pedido.cliente_id === usuario.id || pedido.proveedor_id === usuario.id) {
          throw new ForbiddenException('No puedes arbitrar un pedido en el que participas');
        }
        if (d.a_favor_de !== 'Cliente' && d.a_favor_de !== 'Proveedor') {
          throw new BadRequestException('Indica a favor de quién se resuelve (Cliente o Proveedor)');
        }
        if (!d.decision || d.decision.trim().length < 10) {
          throw new BadRequestException('Explica la decisión (al menos 10 caracteres)');
        }
        break;
      default:
        break;
    }
  }

  private async notificar(accion: AccionContrato, pedido: PedidoCompleto, quien: Usuario, d: DeclaracionPaso) {
    const n = `#${pedido.numero}`;
    const monto = formatoUsdc(String(pedido.monto_usdc));
    const enviar = (id: string, tipo: TipoAviso, texto: string) => this.avisos.crear(id, tipo, texto, pedido.id);
    // Con la verificación en la red encendida no hace falta revisar a mano.
    const verificaEnLab = this.verificador.activo ? '' : ' Revisa la transacción en Stellar Lab y confírmala.';
    switch (accion) {
      case 'crear_pedido':
        await enviar(pedido.proveedor_id, 'te_toca_entregar', `${quien.nombre} pagó ${monto} USDC en garantía (pedido ${n}). Ya puedes empezar.${verificaEnLab}`);
        break;
      case 'marcar_entregado':
        await enviar(pedido.cliente_id, 'te_toca_liberar', `${quien.nombre} entregó el pedido ${n}. Revisa el trabajo y libera el pago, o abre una disputa.`);
        break;
      case 'liberar':
        await enviar(pedido.proveedor_id, 'pedido_cerrado', `${quien.nombre} liberó el pago del pedido ${n}.${verificaEnLab}`);
        break;
      case 'rechazar':
        await enviar(pedido.cliente_id, 'pedido_cerrado', `${quien.nombre} devolvió tu dinero del pedido ${n}.${verificaEnLab}`);
        break;
      case 'reembolsar_por_vencimiento':
        await enviar(pedido.proveedor_id, 'pedido_cerrado', `El pedido ${n} venció sin entrega y ${quien.nombre} recuperó su dinero.`);
        break;
      case 'cobrar_por_vencimiento':
        await enviar(pedido.cliente_id, 'pedido_cerrado', `Venció el plazo de revisión del pedido ${n} y ${quien.nombre} cobró.`);
        break;
      case 'abrir_disputa': {
        const otro = quien.id === pedido.cliente_id ? pedido.proveedor_id : pedido.cliente_id;
        await enviar(otro, 'disputa_abierta', `${quien.nombre} abrió una disputa en el pedido ${n}. El dinero queda congelado hasta que decida el árbitro.`);
        const arbitros = await this.prisma.usuario.findMany({ where: { rol: 'arbitro' }, select: { id: true } });
        for (const a of arbitros) {
          if (a.id !== pedido.cliente_id && a.id !== pedido.proveedor_id) {
            await enviar(a.id, 'disputa_abierta', `Nueva disputa en el pedido ${n}: «${d.motivo!.trim().slice(0, 80)}».`);
          }
        }
        break;
      }
      case 'resolver': {
        const texto = `El árbitro resolvió la disputa del pedido ${n} a favor del ${d.a_favor_de === 'Cliente' ? 'cliente' : 'proveedor'}.`;
        await enviar(pedido.cliente_id, 'disputa_resuelta', texto);
        await enviar(pedido.proveedor_id, 'disputa_resuelta', texto);
        break;
      }
    }
  }

  /** Etiqueta legible de una acción (para mensajes). */
  etiqueta(accion: AccionContrato): string {
    return ACCIONES[accion].etiqueta;
  }
}
