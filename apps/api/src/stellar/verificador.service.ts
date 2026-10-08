import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { FUNCION_CONTRATO, aSegundosUnix, siguienteEstado, usdcAUnidades, type AccionContrato } from '@cryptoville/shared';
import { rpc } from '@stellar/stellar-sdk';
import { CONFIGURACION, type Configuracion } from '../config/configuracion';
import type { Parte } from '../generated/prisma/client';
import type { PedidoCompleto } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { arg, invocacionDeSobre, mismoValor, variante, type Invocacion } from './cadena';
import { StellarService, type TransaccionConfirmada } from './stellar.service';

/** Estado del pedido en la app → estado en el contrato v1. */
const ESTADO_CONTRATO_V1: Record<string, string> = {
  pagado: 'Pagado',
  entregado: 'Entregado',
  en_disputa: 'EnDisputa',
  liberado: 'Liberado',
  reembolsado: 'Reembolsado',
  resuelto: 'Resuelto',
};

export interface ResultadoVerificacion {
  /** Ledger donde quedó la transacción (null si se verificó por el estado del contrato). */
  ledger: number | null;
  /** Wallet del cliente que pagó (al crear el pedido en el contrato). */
  direccionCliente?: string;
}

export interface DatosPaso {
  accion: AccionContrato;
  hash: string;
  a_favor_de?: Parte;
}

/** Direcciones del pedido en el contrato (si están vacías, la wallet de la cuenta). */
export function direccionesDe(p: PedidoCompleto): { cliente: string; proveedor: string } {
  return { cliente: p.direccion_cliente ?? p.cliente.direccion, proveedor: p.direccion_proveedor ?? p.proveedor.direccion };
}

/**
 * Verifica en la red los pasos del contrato v1 antes de registrarlos.
 * Lee la transacción por su hash y comprueba contrato, función, partes, monto, fecha y número de pedido.
 * Si la red ya no guarda la transacción (es vieja), compara el estado del pedido en el contrato.
 */
@Injectable()
export class VerificadorService {
  private readonly log = new Logger('Verificador');

  constructor(
    private readonly stellar: StellarService,
    private readonly prisma: PrismaService,
    @Inject(CONFIGURACION) private readonly config: Configuracion,
  ) {}

  get activo(): boolean {
    return this.stellar.verifica && Boolean(this.config.stellar.contratoId);
  }

  /** Lanza un error en español si la transacción no corresponde al paso. */
  async verificarPasoV1(pedido: PedidoCompleto, declarante: { id: string; direccion: string }, d: DatosPaso, confirmada?: TransaccionConfirmada): Promise<ResultadoVerificacion> {
    const contrato = this.config.stellar.contratoId!;
    const respuesta = confirmada ?? (await this.stellar.esperar(d.hash));
    if (respuesta.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new BadRequestException('Esa transacción falló en la red: el contrato no cambió. Vuelve a hacer el paso.');
    }
    if (respuesta.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      const inv = invocacionDeSobre(respuesta.envelopeXdr, this.stellar.passphrase);
      if (!inv) throw new BadRequestException('Esa transacción no es una llamada a un contrato');
      const direccionCliente = await this.compararInvocacion(contrato, pedido, declarante, d, inv);
      return { ledger: respuesta.ledger, direccionCliente };
    }
    // La red ya no guarda la transacción (o todavía no la ve): se revisa el estado del pedido en el contrato.
    const direccionCliente = await this.compararEstado(contrato, pedido, d);
    return { ledger: null, direccionCliente };
  }

  private async compararInvocacion(
    contrato: string,
    pedido: PedidoCompleto,
    declarante: { id: string; direccion: string },
    d: DatosPaso,
    inv: Invocacion,
  ): Promise<string | undefined> {
    const falla = (texto: string): never => {
      throw new BadRequestException(`La transacción no corresponde a este paso: ${texto}`);
    };
    if (inv.contrato !== contrato) falla('es de otro contrato');
    if (inv.funcion !== FUNCION_CONTRATO[d.accion]) falla(`llama a "${inv.funcion}" y este paso es "${FUNCION_CONTRATO[d.accion]}"`);
    const dir = direccionesDe(pedido);
    const [a0, a1, a2, a3, a4] = inv.args;

    switch (d.accion) {
      case 'crear_pedido': {
        const walletsCliente = await this.walletsDe(pedido.cliente_id, pedido.cliente.direccion);
        if (typeof a0 !== 'string' || !walletsCliente.includes(a0)) falla('el cliente no es una wallet de quien hizo el pedido');
        const proveedorEsperado = pedido.direccion_proveedor ? [pedido.direccion_proveedor] : await this.walletsDe(pedido.proveedor_id, pedido.proveedor.direccion);
        if (typeof a1 !== 'string' || !proveedorEsperado.includes(a1)) falla('el proveedor no es la wallet del proveedor');
        if (!mismoValor(a2, pedido.numero)) falla('el número de pedido no coincide');
        if (!mismoValor(a3, usdcAUnidades(String(pedido.monto_usdc)))) falla('el monto no coincide con el acordado');
        if (!pedido.fecha_limite || !mismoValor(a4, aSegundosUnix(pedido.fecha_limite))) falla('la fecha límite no coincide');
        return a0 as string;
      }
      case 'marcar_entregado':
      case 'rechazar':
      case 'cobrar_por_vencimiento':
        if (a0 !== dir.proveedor) falla('no la firmó la wallet del proveedor del pedido');
        if (!mismoValor(a1, pedido.numero)) falla('el número de pedido no coincide');
        return undefined;
      case 'liberar':
      case 'reembolsar_por_vencimiento':
        if (a0 !== dir.cliente) falla('no la firmó la wallet del cliente del pedido');
        if (!mismoValor(a1, pedido.numero)) falla('el número de pedido no coincide');
        return undefined;
      case 'abrir_disputa': {
        const propias = await this.walletsDe(declarante.id, declarante.direccion);
        if (typeof a0 !== 'string' || ![dir.cliente, dir.proveedor].includes(a0) || !propias.includes(a0)) {
          falla('la disputa la tiene que abrir tu wallet del pedido');
        }
        if (!mismoValor(a1, pedido.numero)) falla('el número de pedido no coincide');
        return undefined;
      }
      case 'resolver':
        if (a0 !== this.config.stellar.arbitro) falla('no la firmó la wallet del árbitro');
        if (!mismoValor(a1, pedido.numero)) falla('el número de pedido no coincide');
        if (variante(a2) !== d.a_favor_de) falla(`en la red se resolvió a favor de ${variante(a2)}`);
        return undefined;
    }
    return undefined;
  }

  private async compararEstado(contrato: string, pedido: PedidoCompleto, d: DatosPaso): Promise<string | undefined> {
    const enCadena = (await this.stellar.leer(contrato, 'pedido', [arg.u64(String(pedido.numero))])) as Record<string, unknown> | null;
    if (!enCadena) throw new BadRequestException('No encontramos esa transacción ni el pedido en el contrato. Revisa el hash.');
    const esperado = ESTADO_CONTRATO_V1[siguienteEstado(pedido.estado, d.accion)];
    if (variante(enCadena.estado) !== esperado) {
      throw new BadRequestException(`En el contrato el pedido está "${variante(enCadena.estado)}", no "${esperado}". Revisa el hash.`);
    }
    if (!mismoValor(enCadena.monto, usdcAUnidades(String(pedido.monto_usdc)))) throw new BadRequestException('El monto del contrato no coincide');
    const dir = direccionesDe(pedido);
    if (d.accion === 'crear_pedido') {
      const walletsCliente = await this.walletsDe(pedido.cliente_id, pedido.cliente.direccion);
      const proveedorEsperado = pedido.direccion_proveedor ? [pedido.direccion_proveedor] : await this.walletsDe(pedido.proveedor_id, pedido.proveedor.direccion);
      if (typeof enCadena.cliente !== 'string' || !walletsCliente.includes(enCadena.cliente)) throw new BadRequestException('El cliente del contrato no coincide');
      if (typeof enCadena.proveedor !== 'string' || !proveedorEsperado.includes(enCadena.proveedor)) throw new BadRequestException('El proveedor del contrato no coincide');
      this.log.log(`Pedido #${pedido.numero} verificado por el estado del contrato`);
      return enCadena.cliente;
    }
    if (enCadena.cliente !== dir.cliente) throw new BadRequestException('El cliente del contrato no coincide');
    if (enCadena.proveedor !== dir.proveedor) throw new BadRequestException('El proveedor del contrato no coincide');
    this.log.log(`Pedido #${pedido.numero} verificado por el estado del contrato`);
    return undefined;
  }

  private async walletsDe(usuarioId: string, deLaCuenta: string): Promise<string[]> {
    const wallets = await this.prisma.wallet.findMany({ where: { usuario_id: usuarioId }, select: { direccion: true } });
    return [...new Set([deLaCuenta, ...wallets.map((w) => w.direccion)])];
  }
}
