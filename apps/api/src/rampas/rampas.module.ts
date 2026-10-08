import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RAMPA_SIMULADA, cotizarRampaSimulada, qrRampaSimulada, unidadesAUsdc, usdcAUnidades, type SentidoRampa } from '@cryptoville/shared';
import { Keypair } from '@stellar/stellar-sdk';
import { IsIn, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { MONTO_USDC } from '../common/montos';
import { SesionGuard } from '../common/sesion.guard';
import { serializar } from '../common/serializar';
import { UsuarioActual } from '../common/usuario-actual';
import { CONFIGURACION, proveedorRampa, type Configuracion } from '../config/configuracion';
import { RUTAS_SEED_KEYS } from '../config/revision-mainnet';
import type { Rampa, Usuario } from '../generated/prisma/client';
import { KycService } from '../kyc/kyc.module';
import { PrismaService } from '../prisma/prisma.service';
import { arg } from '../stellar/cadena';
import { StellarService } from '../stellar/stellar.service';
import { esWalletDe } from '../wallets/wallets.module';

const DIRECCION = /^G[A-Z2-7]{55}$/;

class CotizacionDto {
  @IsIn(['entrada', 'salida'])
  sentido: SentidoRampa;

  @Matches(MONTO_USDC, { message: 'Monto inválido (USDC mayor que 0, hasta 7 decimales)' })
  monto_usdc: string;
}

class EntradaDto {
  @Matches(MONTO_USDC, { message: 'Monto inválido (USDC mayor que 0, hasta 7 decimales)' })
  monto_usdc: string;

  /** Wallet de la cuenta que recibe el USDC (la misma con la que después se paga). */
  @Matches(DIRECCION, { message: 'La dirección debe empezar con G y tener 56 caracteres' })
  direccion: string;

  /** Pedido que se quiere pagar con esta recarga (opcional). */
  @IsOptional()
  @IsUUID('4')
  pedido_id?: string;
}

class SalidaDto {
  @Matches(MONTO_USDC, { message: 'Monto inválido (USDC mayor que 0, hasta 7 decimales)' })
  monto_usdc: string;

  /** Wallet de la cuenta que manda el USDC. */
  @Matches(DIRECCION, { message: 'La dirección debe empezar con G y tener 56 caracteres' })
  direccion: string;

  @IsString()
  @Length(3, 80)
  banco: string;

  /** Número de cuenta: solo se guardan los últimos 4 dígitos. */
  @Matches(/^[0-9]{6,20}$/, { message: 'El número de cuenta son solo números (de 6 a 20)' })
  cuenta: string;
}

/**
 * Rampas: bolivianos → USDC («pagar con el QR del banco») y USDC → cuenta del banco («pasar a mi banco»).
 *
 * Cryptoville no recibe ni guarda dinero. En mainnet el cambio lo hace Pollar (con su SDK, desde el navegador
 * y con la sesión de la persona). En testnet la rampa es SIMULADA: el «QR» es de mentira y, al tocar
 * «Simular el pago desde el banco», la API emite USDC de prueba con la llave del emisor del token de prueba.
 * Lo simulado y lo que falta revisar está en docs/simulaciones.md.
 */
@Injectable()
export class RampasService {
  private readonly log = new Logger('Rampas');

  constructor(
    private readonly prisma: PrismaService,
    private readonly stellar: StellarService,
    private readonly kyc: KycService,
    @Inject(CONFIGURACION) private readonly config: Configuracion,
  ) {}

  get proveedor() {
    return proveedorRampa(this.config);
  }

  private exigirSimulada(): void {
    if (!this.config.rampaSimulada) {
      throw new ServiceUnavailableException(
        this.proveedor === 'pollar' ? 'Esta operación se hace con tu cuenta de Pollar, desde la app' : 'El pago con el QR del banco todavía no está disponible en este servidor',
      );
    }
  }

  private validarMonto(monto: string): void {
    const n = Number(monto);
    if (n < RAMPA_SIMULADA.minimoUsdc || n > RAMPA_SIMULADA.maximoUsdc) {
      throw new BadRequestException(`El monto va de ${RAMPA_SIMULADA.minimoUsdc} a ${RAMPA_SIMULADA.maximoUsdc} USDC por operación`);
    }
  }

  /** Llave del emisor del USDC de prueba: RAMPA_SIMULADA_LLAVE o, en desarrollo, la de .seed-keys.json. */
  private llaveEmisor(): string {
    const delEnv = this.config.rampaSimulada?.llaveEmisor;
    if (delEnv) return delEnv;
    for (const ruta of RUTAS_SEED_KEYS) {
      if (!existsSync(ruta)) continue;
      try {
        const llave = (JSON.parse(readFileSync(ruta, 'utf8')) as { emisor_usdc?: { secreta?: string } }).emisor_usdc?.secreta;
        if (llave && /^S[A-Z2-7]{55}$/.test(llave)) return llave;
      } catch {
        // Un archivo que no se puede leer no sirve.
      }
    }
    throw new ServiceUnavailableException('La rampa simulada no tiene la llave del emisor del USDC de prueba (RAMPA_SIMULADA_LLAVE o .seed-keys.json)');
  }

  /** Quién «recibe» el USDC en un retiro simulado: el emisor del USDC de prueba (hace de rampa). */
  private direccionRampaSimulada(): string {
    return Keypair.fromSecret(this.llaveEmisor()).publicKey();
  }

  cotizar(sentido: SentidoRampa, monto: string) {
    this.exigirSimulada();
    this.validarMonto(monto);
    return { proveedor: 'simulada' as const, ...cotizarRampaSimulada(sentido, monto) };
  }

  /** Saldo de USDC de una wallet de la cuenta (null si no se pudo leer la red). */
  async saldo(yo: Usuario, direccion?: string) {
    const dir = direccion ?? yo.direccion;
    if (!(await esWalletDe(this.prisma, yo, dir))) throw new ForbiddenException('Esa wallet no es de tu cuenta');
    const tokenId = this.config.stellar.tokenId;
    if (!tokenId || this.config.entorno === 'test') return { direccion: dir, saldo_usdc: null };
    try {
      const valor = await this.stellar.leer(tokenId, 'balance', [arg.direccion(dir)]);
      return { direccion: dir, saldo_usdc: unidadesAUsdc(BigInt((valor as bigint | number | null) ?? 0)) };
    } catch {
      return { direccion: dir, saldo_usdc: null };
    }
  }

  private referencia(): string {
    return `CV-${randomBytes(4).toString('hex').toUpperCase()}`;
  }

  private vence(): Date {
    return new Date(Date.now() + RAMPA_SIMULADA.minutosVigencia * 60_000);
  }

  private async propia(yo: Usuario, id: string): Promise<Rampa> {
    const r = await this.prisma.rampa.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('No existe esa operación');
    if (r.usuario_id !== yo.id) throw new ForbiddenException('Esa operación no es tuya');
    return r;
  }

  /** Recarga: la persona ve un QR con el monto en bolivianos y lo paga desde su banco. */
  async crearEntrada(yo: Usuario, dto: EntradaDto): Promise<Rampa> {
    this.exigirSimulada();
    this.validarMonto(dto.monto_usdc);
    if (!(await esWalletDe(this.prisma, yo, dto.direccion))) throw new ForbiddenException('Esa wallet no es de tu cuenta');
    if (dto.pedido_id) {
      const pedido = await this.prisma.pedido.findUnique({ where: { id: dto.pedido_id }, select: { cliente_id: true } });
      if (!pedido || pedido.cliente_id !== yo.id) throw new ForbiddenException('Solo el cliente del pedido puede recargar para pagarlo');
    }
    const c = cotizarRampaSimulada('entrada', dto.monto_usdc);
    const referencia = this.referencia();
    return this.prisma.rampa.create({
      data: {
        usuario_id: yo.id,
        sentido: 'entrada',
        proveedor: 'simulada',
        pais: c.pais,
        moneda: c.moneda,
        monto_usdc: dto.monto_usdc,
        monto_local: c.monto_local,
        tipo_cambio: c.tipo_cambio,
        comision_local: c.comision_local,
        direccion: dto.direccion,
        pedido_id: dto.pedido_id ?? null,
        estado: 'esperando_pago',
        referencia,
        qr_payload: qrRampaSimulada(referencia, c.monto_local, c.moneda),
        expira_en: this.vence(),
      },
    });
  }

  /**
   * SIMULADO: hace como si el banco hubiera pagado el QR. La «rampa» (el emisor del USDC de prueba)
   * manda el USDC de prueba a la wallet de la persona. En mainnet esto lo hace la rampa real, sola.
   */
  async simularPagoBancario(yo: Usuario, id: string): Promise<Rampa> {
    this.exigirSimulada();
    const r = await this.propia(yo, id);
    if (r.sentido !== 'entrada') throw new BadRequestException('Esa operación no es una recarga');
    if (r.estado === 'acreditada') return r;
    if (r.estado !== 'esperando_pago') throw new ConflictException('Esta recarga ya no espera un pago');
    if (r.expira_en < new Date()) {
      await this.prisma.rampa.update({ where: { id }, data: { estado: 'vencida' } });
      throw new BadRequestException('El QR venció: arma otro');
    }
    // Se marca primero: dos clics seguidos no emiten dos veces.
    const marcada = await this.prisma.rampa.updateMany({ where: { id, estado: 'esperando_pago' }, data: { estado: 'acreditada' } });
    if (marcada.count !== 1) throw new ConflictException('Esta recarga ya se está procesando');
    try {
      // En las pruebas automáticas no hay red: un hash de mentira.
      const hash =
        this.config.entorno === 'test'
          ? createHash('sha256').update(`rampa-${id}`).digest('hex')
          : (await this.stellar.emitirParaRampaSimulada(this.llaveEmisor(), r.direccion, usdcAUnidades(r.monto_usdc.toFixed(7)))).hash;
      this.log.log(`Recarga simulada ${r.referencia}: ${r.monto_usdc.toString()} USDC de prueba a ${r.direccion.slice(0, 6)}…`);
      return await this.prisma.rampa.update({ where: { id }, data: { tx_hash: hash } });
    } catch (e) {
      await this.prisma.rampa.update({ where: { id }, data: { estado: 'fallida' } });
      throw e;
    }
  }

  /** Retiro: la persona elige banco y cuenta; después firma el envío del USDC a la rampa. */
  async crearSalida(yo: Usuario, dto: SalidaDto): Promise<Rampa> {
    this.exigirSimulada();
    this.kyc.exigir(yo, 'cobrar');
    this.validarMonto(dto.monto_usdc);
    if (!(await esWalletDe(this.prisma, yo, dto.direccion))) throw new ForbiddenException('Esa wallet no es de tu cuenta');
    if (!(RAMPA_SIMULADA.bancos as readonly string[]).includes(dto.banco)) throw new BadRequestException('Elige un banco de la lista');
    const c = cotizarRampaSimulada('salida', dto.monto_usdc);
    return this.prisma.rampa.create({
      data: {
        usuario_id: yo.id,
        sentido: 'salida',
        proveedor: 'simulada',
        pais: c.pais,
        moneda: c.moneda,
        monto_usdc: dto.monto_usdc,
        monto_local: c.monto_local,
        tipo_cambio: c.tipo_cambio,
        comision_local: c.comision_local,
        direccion: dto.direccion,
        estado: 'esperando_envio',
        referencia: this.referencia(),
        banco: dto.banco,
        cuenta_final: dto.cuenta.slice(-4),
        expira_en: this.vence(),
      },
    });
  }

  /** Para armar la transferencia del retiro (la firma la persona): a quién y cuánto. */
  async datosParaEnvio(yo: Usuario, id: string, direccion: string): Promise<{ destino: string; unidades: string }> {
    this.exigirSimulada();
    const r = await this.propia(yo, id);
    if (r.sentido !== 'salida' || r.estado !== 'esperando_envio') throw new ConflictException('Este retiro ya no espera un envío');
    if (r.expira_en < new Date()) {
      await this.prisma.rampa.update({ where: { id }, data: { estado: 'vencida' } });
      throw new BadRequestException('Pasó demasiado tiempo: arma el retiro otra vez');
    }
    if (r.direccion !== direccion) throw new BadRequestException('Firma con la misma wallet que elegiste para el retiro');
    return { destino: this.direccionRampaSimulada(), unidades: usdcAUnidades(r.monto_usdc.toFixed(7)) };
  }

  /** El envío del retiro ya está en la red (lo verificó /transacciones/enviar). */
  async registrarEnvio(yo: Usuario, id: string, hash: string): Promise<Rampa> {
    const marcada = await this.prisma.rampa.updateMany({ where: { id, usuario_id: yo.id, estado: 'esperando_envio' }, data: { estado: 'enviada', tx_hash: hash } });
    if (marcada.count !== 1) throw new ConflictException('Este retiro ya se registró');
    return this.prisma.rampa.findUniqueOrThrow({ where: { id } });
  }
}

@Controller('rampas')
@UseGuards(SesionGuard)
export class RampasController {
  constructor(private readonly rampas: RampasService) {}

  @Get('saldo')
  async saldo(@UsuarioActual() yo: Usuario, @Query('direccion') direccion?: string) {
    if (direccion && !DIRECCION.test(direccion)) throw new BadRequestException('Dirección inválida');
    return this.rampas.saldo(yo, direccion);
  }

  @Post('cotizacion')
  cotizacion(@Body() dto: CotizacionDto) {
    return this.rampas.cotizar(dto.sentido, dto.monto_usdc);
  }

  @Post('entradas')
  async entrada(@UsuarioActual() yo: Usuario, @Body() dto: EntradaDto) {
    return serializar(await this.rampas.crearEntrada(yo, dto));
  }

  /** SIMULADO (solo testnet): hacer como si el banco hubiera pagado el QR. */
  @Post('entradas/:id/simular-pago')
  @Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 10, ttl: 60_000 } })
  async simularPago(@UsuarioActual() yo: Usuario, @Param('id', ParseUUIDPipe) id: string) {
    return serializar(await this.rampas.simularPagoBancario(yo, id));
  }

  @Post('salidas')
  async salida(@UsuarioActual() yo: Usuario, @Body() dto: SalidaDto) {
    return serializar(await this.rampas.crearSalida(yo, dto));
  }
}

@Module({ controllers: [RampasController], providers: [RampasService], exports: [RampasService] })
export class RampasModule {}
