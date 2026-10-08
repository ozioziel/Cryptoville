import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  HttpCode,
  Inject,
  Injectable,
  Module,
  NotFoundException,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { FUNCION_CONTRATO, aSegundosUnix, esAccionContrato, reglasDe, usdcAUnidades, type AccionContrato } from '@cryptoville/shared';
import type { xdr } from '@stellar/stellar-sdk';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min, ValidateIf } from 'class-validator';
import { PagosService, type DatosPasoV2, type ResultadoDisputa } from '../pagos/pagos.service';
import type { FuncionV2 } from '@cryptoville/shared';
import { SesionGuard } from '../common/sesion.guard';
import { serializar } from '../common/serializar';
import { UsuarioActual } from '../common/usuario-actual';
import { CONFIGURACION, type Configuracion } from '../config/configuracion';
import { EscrowService } from '../escrow/escrow.service';
import { LocalesService } from '../locales/locales.module';
import { RampasService } from '../rampas/rampas.module';
import type { Parte, Usuario } from '../generated/prisma/client';
import { OrdersService, type PedidoCompleto } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { arg, hashDe, transaccionDeXdr } from '../stellar/cadena';
import { StellarService } from '../stellar/stellar.service';
import { direccionesDe } from '../stellar/verificador.service';
import { esWalletDe, walletParaCobrar } from '../wallets/wallets.module';

/** Minutos que dura una transacción armada antes de tener que pedir otra. */
const VIGENCIA_MIN = 10;

class PrepararPasoDto {
  /**
   * paso_pedido: contrato v1 · paso_v2: fases del contrato v2 · pago_directo: pago sin garantía (v2)
   * · pago_local: pago único del local extra (USDC a la tesorería; no es de un pedido)
   * · retiro_rampa: mandar USDC a la rampa para cobrarlo en el banco (no es de un pedido).
   */
  @IsIn(['paso_pedido', 'paso_v2', 'pago_directo', 'pago_local', 'retiro_rampa'])
  tipo: 'paso_pedido' | 'paso_v2' | 'pago_directo' | 'pago_local' | 'retiro_rampa';

  @ValidateIf((o: PrepararPasoDto) => o.tipo !== 'pago_local' && o.tipo !== 'retiro_rampa')
  @IsUUID('4')
  pedido_id: string;

  @ValidateIf((o: PrepararPasoDto) => o.tipo !== 'pago_local' && o.tipo !== 'retiro_rampa')
  @IsString()
  accion: string;

  /** retiro_rampa: el retiro que se va a mandar. */
  @ValidateIf((o: PrepararPasoDto) => o.tipo === 'retiro_rampa')
  @IsUUID('4')
  rampa_id?: string;

  /** Wallet que va a firmar (tiene que ser una wallet de la cuenta). */
  @Matches(/^G[A-Z2-7]{55}$/, { message: 'La dirección debe empezar con G y tener 56 caracteres' })
  direccion: string;

  @IsOptional()
  @IsIn(['Cliente', 'Proveedor'])
  a_favor_de?: Parte;

  @IsOptional()
  @IsString()
  @Length(10, 1000)
  motivo?: string;

  @IsOptional()
  @IsString()
  @Length(10, 1000)
  decision?: string;

  /** Fase del pedido (contrato v2). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9)
  fase?: number;

  /** Resultado de una disputa del v2: Cliente, Proveedor o Mitad. */
  @IsOptional()
  @IsIn(['Cliente', 'Proveedor', 'Mitad'])
  resultado?: ResultadoDisputa;
}

class EnviarDto {
  @IsUUID('4')
  id: string;

  @IsString()
  @Length(100, 20_000, { message: 'La transacción firmada no es válida' })
  xdr_firmado: string;
}

interface DatosPasoPreparado {
  accion: AccionContrato;
  a_favor_de?: Parte;
  motivo?: string;
  decision?: string;
}

/**
 * Firmar dentro de la app (sin Stellar Lab):
 * 1. `preparar`: la API arma la transacción SIN firmar, la simula en la red y la guarda.
 * 2. La wallet de la persona (Freighter, LOBSTR por QR, Pollar…) la firma en su dispositivo.
 * 3. `enviar`: la API comprueba que sea exactamente la misma transacción (mismo hash), la envía,
 *    espera la confirmación y registra el paso ya verificado.
 * El servidor nunca firma por nadie.
 */
@Injectable()
export class TransaccionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stellar: StellarService,
    private readonly orders: OrdersService,
    private readonly escrow: EscrowService,
    private readonly pagos: PagosService,
    private readonly locales: LocalesService,
    private readonly rampas: RampasService,
    @Inject(CONFIGURACION) private readonly config: Configuracion,
  ) {}

  async prepararPaso(yo: Usuario, dto: PrepararPasoDto) {
    if (dto.tipo === 'pago_local') return this.prepararPagoLocal(yo, dto.direccion);
    if (dto.tipo === 'retiro_rampa') return this.prepararRetiro(yo, dto.rampa_id!, dto.direccion);
    if (dto.tipo !== 'paso_pedido') return this.prepararV2(yo, dto);
    if (!this.stellar.armaTransacciones || !this.config.stellar.contratoId) {
      throw new ServiceUnavailableException('Firmar dentro de la app no está disponible en este servidor: usa Stellar Lab');
    }
    if (!esAccionContrato(dto.accion as never)) throw new BadRequestException('Esa acción no es un paso del contrato');
    const accion = dto.accion as AccionContrato;
    const { pedido, rol } = await this.orders.cargarVisible(dto.pedido_id, yo);
    if (pedido.es_ejemplo) throw new BadRequestException('Este es un pedido de ejemplo: no tiene transacciones reales');
    if (pedido.contrato !== 'v1') throw new BadRequestException('Este pedido es del contrato v2');
    this.orders.exigirPermiso(accion, pedido, rol);
    await this.escrow.validarReglas(accion, pedido, yo, { accion, hash: '', motivo: dto.motivo, a_favor_de: dto.a_favor_de, decision: dto.decision });
    if (!(await esWalletDe(this.prisma, yo, dto.direccion)) && !(accion === 'resolver' && dto.direccion === this.config.stellar.arbitro)) {
      throw new ForbiddenException('Esa wallet no es de tu cuenta: súmala en tu perfil o conecta otra');
    }

    const args = await this.argumentos(accion, pedido, dto);
    const { xdr: sinFirmar, hash } = await this.stellar.preparar(dto.direccion, this.config.stellar.contratoId, FUNCION_CONTRATO[accion], args);
    const datos: DatosPasoPreparado = { accion, a_favor_de: dto.a_favor_de, motivo: dto.motivo, decision: dto.decision };
    const preparada = await this.prisma.transaccionPreparada.create({
      data: {
        usuario_id: yo.id,
        tipo: 'paso_pedido',
        pedido_id: pedido.id,
        direccion: dto.direccion,
        hash,
        xdr: sinFirmar,
        datos: { ...datos },
        expira_en: new Date(Date.now() + VIGENCIA_MIN * 60_000),
      },
    });
    return { id: preparada.id, xdr: sinFirmar, red: this.config.stellar.red, passphrase: this.stellar.passphrase, funcion: FUNCION_CONTRATO[accion] };
  }

  /** Pago del local extra: `transfer` del token (USDC) desde tu wallet a la tesorería, por el precio de reglas.ts. */
  private async prepararPagoLocal(yo: Usuario, direccion: string) {
    const { tesoreria, tokenId, red } = this.config.stellar;
    if (!this.stellar.armaTransacciones || !tesoreria || !tokenId) {
      throw new ServiceUnavailableException('El pago de locales extra todavía no está disponible en este servidor');
    }
    if (!(await esWalletDe(this.prisma, yo, direccion))) throw new ForbiddenException('Esa wallet no es de tu cuenta: súmala en tu perfil o conecta otra');
    const cupo = await this.locales.cupo(yo);
    if (!cupo.puede_abrir) throw new ConflictException(`Ya tienes ${cupo.maximo} locales, el máximo`);
    if (!cupo.necesita_pago) throw new ConflictException('Todavía puedes abrir un local sin pagar');
    const precio = reglasDe(red).locales.precioExtraUsdc;
    const args = [arg.direccion(direccion), arg.direccion(tesoreria), arg.i128(usdcAUnidades(precio))];
    const { xdr: sinFirmar, hash } = await this.stellar.preparar(direccion, tokenId, 'transfer', args);
    const preparada = await this.prisma.transaccionPreparada.create({
      data: {
        usuario_id: yo.id,
        tipo: 'pago_local',
        direccion,
        hash,
        xdr: sinFirmar,
        datos: { precio },
        expira_en: new Date(Date.now() + VIGENCIA_MIN * 60_000),
      },
    });
    return { id: preparada.id, xdr: sinFirmar, red, passphrase: this.stellar.passphrase, funcion: 'transfer' };
  }

  /** Retiro a la cuenta del banco: USDC de la wallet de la persona a la rampa (la firma la persona). */
  private async prepararRetiro(yo: Usuario, rampaId: string, direccion: string) {
    const { tokenId, red } = this.config.stellar;
    if (!this.stellar.armaTransacciones || !tokenId) throw new ServiceUnavailableException('Los retiros al banco todavía no están disponibles en este servidor');
    if (!(await esWalletDe(this.prisma, yo, direccion))) throw new ForbiddenException('Esa wallet no es de tu cuenta: súmala en tu perfil o conecta otra');
    const { destino, unidades } = await this.rampas.datosParaEnvio(yo, rampaId, direccion);
    const args = [arg.direccion(direccion), arg.direccion(destino), arg.i128(unidades)];
    const { xdr: sinFirmar, hash } = await this.stellar.preparar(direccion, tokenId, 'transfer', args);
    const preparada = await this.prisma.transaccionPreparada.create({
      data: {
        usuario_id: yo.id,
        tipo: 'retiro_rampa',
        direccion,
        hash,
        xdr: sinFirmar,
        datos: { rampa_id: rampaId },
        expira_en: new Date(Date.now() + VIGENCIA_MIN * 60_000),
      },
    });
    return { id: preparada.id, xdr: sinFirmar, red, passphrase: this.stellar.passphrase, funcion: 'transfer' };
  }

  /** Pasos del contrato v2 (fases) y pago directo. */
  private async prepararV2(yo: Usuario, dto: PrepararPasoDto) {
    if (!this.stellar.armaTransacciones || !this.pagos.contratoV2) {
      throw new ServiceUnavailableException('El contrato v2 no está disponible en este servidor');
    }
    const funcion = (dto.tipo === 'pago_directo' ? 'pagar_directo' : dto.accion) as FuncionV2;
    if (!PagosService.FUNCIONES_PASO.includes(funcion)) throw new BadRequestException('Esa acción no es un paso del contrato v2');
    const { pedido, rol } = await this.orders.cargarVisible(dto.pedido_id, yo);
    if (pedido.es_ejemplo) throw new BadRequestException('Este es un pedido de ejemplo: no tiene transacciones reales');
    const esVencimiento = ['cobrar_por_vencimiento', 'reembolsar_por_vencimiento', 'resolver_por_vencimiento'].includes(funcion);
    // Los vencimientos los puede firmar cualquiera de las partes con cualquiera de sus wallets.
    const deArbitro = funcion === 'resolver' && dto.direccion === this.config.stellar.arbitro;
    if (!deArbitro && !(await esWalletDe(this.prisma, yo, dto.direccion))) {
      throw new ForbiddenException('Esa wallet no es de tu cuenta: súmala en tu perfil o conecta otra');
    }
    const datos: DatosPasoV2 = { funcion, fase: dto.fase, resultado: dto.resultado, motivo: dto.motivo, decision: dto.decision };
    const { contrato, args } = await this.pagos.argumentosV2(yo, pedido, rol, dto.direccion, datos);
    const { xdr: sinFirmar, hash } = await this.stellar.preparar(dto.direccion, contrato, funcion, args);
    const preparada = await this.prisma.transaccionPreparada.create({
      data: {
        usuario_id: yo.id,
        tipo: 'paso_v2',
        pedido_id: pedido.id,
        direccion: dto.direccion,
        hash,
        xdr: sinFirmar,
        datos: { ...datos, vencimiento: esVencimiento },
        expira_en: new Date(Date.now() + VIGENCIA_MIN * 60_000),
      },
    });
    return { id: preparada.id, xdr: sinFirmar, red: this.config.stellar.red, passphrase: this.stellar.passphrase, funcion };
  }

  async enviar(yo: Usuario, dto: EnviarDto) {
    const preparada = await this.prisma.transaccionPreparada.findUnique({ where: { id: dto.id } });
    if (!preparada || preparada.usuario_id !== yo.id) throw new NotFoundException('No encontramos esa transacción; vuelve a intentar');
    if (preparada.usada_en) throw new ConflictException('Esa transacción ya se envió');
    if (preparada.expira_en < new Date()) throw new BadRequestException('Pasó demasiado tiempo: vuelve a intentar para armar otra transacción');

    let hash: string;
    try {
      const tx = transaccionDeXdr(dto.xdr_firmado, this.stellar.passphrase);
      if (tx.signatures.length === 0) throw new Error('sin firmas');
      hash = hashDe(tx);
    } catch {
      throw new BadRequestException('La transacción firmada no se pudo leer');
    }
    // La wallet tiene que haber firmado exactamente lo que armó la API (mismo hash), no otra cosa.
    if (hash !== preparada.hash) throw new BadRequestException('La transacción firmada no es la que armó Cryptoville');

    const marcada = await this.prisma.transaccionPreparada.updateMany({ where: { id: preparada.id, usada_en: null }, data: { usada_en: new Date() } });
    if (marcada.count !== 1) throw new ConflictException('Esa transacción ya se envió');
    const confirmada = await this.stellar.enviar(dto.xdr_firmado);

    switch (preparada.tipo) {
      case 'paso_pedido': {
        const datos = preparada.datos as unknown as DatosPasoPreparado;
        const pedido = await this.escrow.declarar(yo, preparada.pedido_id!, { ...datos, hash }, confirmada);
        return { hash, pedido };
      }
      case 'paso_v2': {
        const datos = preparada.datos as unknown as DatosPasoV2;
        const pedido = await this.pagos.registrarV2(yo, preparada.pedido_id!, datos, confirmada);
        return { hash, pedido };
      }
      case 'pago_local': {
        await this.locales.registrarPago(yo, hash, preparada.direccion, confirmada);
        return { hash, cupo: await this.locales.cupo(yo) };
      }
      case 'retiro_rampa': {
        const { rampa_id } = preparada.datos as { rampa_id: string };
        return { hash, rampa: serializar(await this.rampas.registrarEnvio(yo, rampa_id, hash)) };
      }
      default:
        return { hash };
    }
  }

  /** Argumentos de cada función del contrato v1, en el orden de lib.rs. */
  private async argumentos(accion: AccionContrato, pedido: PedidoCompleto, dto: PrepararPasoDto): Promise<xdr.ScVal[]> {
    const dir = direccionesDe(pedido);
    const id = arg.u64(String(pedido.numero));
    const exigir = (esperada: string, quien: string) => {
      if (dto.direccion !== esperada) {
        throw new BadRequestException(`Este pedido usa la wallet ${esperada.slice(0, 5)}…${esperada.slice(-5)} del ${quien}: conéctala para firmar`);
      }
    };
    switch (accion) {
      case 'crear_pedido': {
        if (!pedido.fecha_limite) throw new BadRequestException('El pedido no tiene fecha límite');
        const proveedor = pedido.direccion_proveedor ?? (await walletParaCobrar(this.prisma, pedido.proveedor));
        return [
          arg.direccion(dto.direccion),
          arg.direccion(proveedor),
          id,
          arg.i128(usdcAUnidades(String(pedido.monto_usdc))),
          arg.u64(aSegundosUnix(pedido.fecha_limite)),
        ];
      }
      case 'marcar_entregado':
      case 'rechazar':
      case 'cobrar_por_vencimiento':
        exigir(dir.proveedor, 'proveedor');
        return [arg.direccion(dir.proveedor), id];
      case 'liberar':
      case 'reembolsar_por_vencimiento':
        exigir(dir.cliente, 'cliente');
        return [arg.direccion(dir.cliente), id];
      case 'abrir_disputa':
        if (dto.direccion !== dir.cliente && dto.direccion !== dir.proveedor) {
          throw new BadRequestException('Firma con la wallet que usaste en este pedido');
        }
        return [arg.direccion(dto.direccion), id];
      case 'resolver':
        if (!this.config.stellar.arbitro || dto.direccion !== this.config.stellar.arbitro) {
          throw new BadRequestException('Firma con la wallet del árbitro del contrato');
        }
        return [arg.direccion(dto.direccion), id, arg.variante(dto.a_favor_de ?? 'Cliente')];
    }
  }
}

@Controller('transacciones')
@UseGuards(SesionGuard)
export class TransaccionesController {
  constructor(private readonly transacciones: TransaccionesService) {}

  /** Arma la transacción de un paso para firmarla en la app. */
  @Post('preparar')
  @HttpCode(200)
  async preparar(@UsuarioActual() yo: Usuario, @Body() dto: PrepararPasoDto) {
    return this.transacciones.prepararPaso(yo, dto);
  }

  /** Recibe la transacción firmada, la envía a la red y registra el paso. */
  @Post('enviar')
  @HttpCode(200)
  async enviar(@UsuarioActual() yo: Usuario, @Body() dto: EnviarDto) {
    return serializar(await this.transacciones.enviar(yo, dto));
  }
}
