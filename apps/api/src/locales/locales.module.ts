import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import {
  BARRIOS,
  BARRIOS_ANTERIORES,
  COLORES_LOCAL,
  COLORES_LOCAL_ANTERIORES,
  LISTA_BARRIOS,
  esCategoriaDe,
  normalizarAparienciaCasa,
  primerLoteLibre,
  reglasDe,
  usdcAUnidades,
  validarAparienciaCasa,
  type Barrio,
} from '@cryptoville/shared';
import { rpc } from '@stellar/stellar-sdk';
import { Transform } from 'class-transformer';
import { IsIn, IsObject, IsOptional, IsString, Length, Matches } from 'class-validator';
import { SesionGuard } from '../common/sesion.guard';
import { serializar } from '../common/serializar';
import { UsuarioActual } from '../common/usuario-actual';
import { CONFIGURACION, type Configuracion } from '../config/configuracion';
import { Prisma, type Local, type Usuario } from '../generated/prisma/client';
import { KycService } from '../kyc/kyc.module';
import { PrismaService } from '../prisma/prisma.service';
import { invocacionDeSobre } from '../stellar/cadena';
import { StellarService, type TransaccionConfirmada } from '../stellar/stellar.service';
import { esWalletDe } from '../wallets/wallets.module';

export class LocalDto {
  @IsString()
  @Length(2, 40, { message: 'El nombre del local debe tener entre 2 y 40 caracteres' })
  nombre: string;

  /** Villa del local. Se aceptan también los nombres anteriores (diseno, clases, tecnologia). */
  @Transform(({ value }) => (typeof value === 'string' ? (BARRIOS_ANTERIORES[value] ?? value) : value))
  @IsIn(LISTA_BARRIOS, { message: 'Elige una villa: creativo, tech, audiovisual o academy' })
  barrio: Barrio;

  /** Una categoría de la villa. Si no viene, se conserva la actual o se usa la primera de la villa. */
  @IsOptional()
  @IsString()
  categoria?: string;

  @IsOptional()
  @IsString()
  @Length(0, 280)
  descripcion?: string;

  @IsOptional()
  @IsIn([...COLORES_LOCAL, ...COLORES_LOCAL_ANTERIORES], { message: 'Color no permitido' })
  color?: string;

  /** Casa personalizada: piezas de la villa (se valida contra CATALOGO_CASA). */
  @IsOptional()
  @IsObject({ message: 'La apariencia de la casa debe ser un objeto' })
  apariencia?: Record<string, unknown>;
}

class PagoLocalDto {
  /** Hash de la transferencia de USDC a la tesorería (firmada en Stellar Lab o en otra wallet). */
  @Matches(/^[0-9a-fA-F]{64}$/, { message: 'El hash de la transacción tiene 64 caracteres (0-9, a-f)' })
  hash: string;

  /** Wallet que pagó (tiene que ser de tu cuenta). */
  @Matches(/^G[A-Z2-7]{55}$/, { message: 'La dirección debe empezar con G y tener 56 caracteres' })
  direccion: string;
}

/** Lo que muestra «Mis locales»: cuántos hay, cuántos son gratis y si el próximo necesita pago. */
export interface CupoLocales {
  total: number;
  gratis: number;
  maximo: number;
  precio_extra_usdc: string;
  /** Pagos de local extra ya hechos que todavía no se usaron. */
  pagos_disponibles: number;
  puede_abrir: boolean;
  necesita_pago: boolean;
  /** ¿Se puede pagar el local extra desde la app? (hace falta la tesorería y el token configurados). */
  pago_disponible: boolean;
  tesoreria: string | null;
  token: string | null;
}

/**
 * Locales de cada persona: hasta 3 gratis, del cuarto en adelante con un pago único en USDC
 * a la tesorería (verificado en la red), y un tope absoluto. Los números están en packages/shared/src/reglas.ts.
 * El local principal es el más antiguo: es el que usa `PUT /api/mi-local`, que sigue funcionando igual.
 */
@Injectable()
export class LocalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kyc: KycService,
    private readonly stellar: StellarService,
    @Inject(CONFIGURACION) private readonly config: Configuracion,
  ) {}

  private get reglas() {
    return reglasDe(this.config.stellar.red).locales;
  }

  propios(usuarioId: string): Promise<Local[]> {
    return this.prisma.local.findMany({ where: { usuario_id: usuarioId }, orderBy: [{ creado_en: 'asc' }, { id: 'asc' }] });
  }

  principal(usuarioId: string): Promise<Local | null> {
    return this.prisma.local.findFirst({ where: { usuario_id: usuarioId }, orderBy: [{ creado_en: 'asc' }, { id: 'asc' }] });
  }

  /** Un local de la persona (para editarlo o usarlo en una propuesta). */
  async propio(yo: Pick<Usuario, 'id'>, id: string): Promise<Local> {
    const local = await this.prisma.local.findUnique({ where: { id } });
    if (!local) throw new NotFoundException('No existe ese local');
    if (local.usuario_id !== yo.id) throw new ForbiddenException('Ese local no es tuyo');
    return local;
  }

  async cupo(yo: Pick<Usuario, 'id'>): Promise<CupoLocales> {
    const [total, pagos] = await Promise.all([
      this.prisma.local.count({ where: { usuario_id: yo.id } }),
      this.prisma.pagoPlataforma.count({ where: { usuario_id: yo.id, concepto: 'local_extra', local_id: null } }),
    ]);
    const r = this.reglas;
    const s = this.config.stellar;
    return {
      total,
      gratis: r.gratis,
      maximo: r.maximo,
      precio_extra_usdc: r.precioExtraUsdc,
      pagos_disponibles: pagos,
      puede_abrir: total < r.maximo,
      necesita_pago: total >= r.gratis && pagos === 0,
      pago_disponible: Boolean(s.tesoreria && s.tokenId),
      tesoreria: s.tesoreria,
      token: s.tokenId,
    };
  }

  /**
   * Abre un local nuevo o guarda uno existente.
   * - Local nuevo o cambio de villa: primer lote libre de la villa (sin tope; se reutilizan los huecos).
   * - Misma villa: la casa conserva su lote.
   * - Del cuarto local en adelante se usa un pago de local extra (y queda atado a ese local).
   */
  async guardar(yo: Usuario, actual: Local | null, dto: LocalDto): Promise<Local> {
    if (!actual) {
      // Abrir un local exige el KYC (si está encendido).
      this.kyc.exigir(yo, 'abrir_local');
      const cupo = await this.cupo(yo);
      if (!cupo.puede_abrir) throw new ConflictException(`Puedes tener hasta ${cupo.maximo} locales`);
      if (cupo.necesita_pago) {
        throw new ConflictException(
          `Tienes ${cupo.total} locales: los primeros ${cupo.gratis} son gratis. Para abrir otro, paga ${cupo.precio_extra_usdc} USDC (una sola vez) desde «Mis locales».`,
        );
      }
    }
    const mismaVilla = actual?.barrio === dto.barrio;
    const categoria = dto.categoria ?? (actual && mismaVilla ? actual.categoria : BARRIOS[dto.barrio].categorias[0].id);
    if (!esCategoriaDe(dto.barrio, categoria)) {
      throw new BadRequestException(`Esa categoría no es de la Villa ${BARRIOS[dto.barrio].nombre}`);
    }
    let apariencia: Prisma.InputJsonValue | undefined;
    if (dto.apariencia !== undefined) {
      const r = validarAparienciaCasa(dto.barrio, dto.apariencia);
      if (!r.ok) throw new BadRequestException(r.error);
      apariencia = { ...r.valor };
    } else if (actual?.apariencia && !mismaVilla) {
      // Cambio de villa sin casa nueva: se conservan las piezas compatibles con la villa nueva.
      apariencia = { ...normalizarAparienciaCasa(dto.barrio, actual.apariencia) };
    }

    const datos = {
      nombre: dto.nombre.trim(),
      barrio: dto.barrio,
      categoria,
      descripcion: dto.descripcion?.trim() || null,
      color: dto.color ?? actual?.color ?? COLORES_LOCAL[0],
      ...(apariencia === undefined ? {} : { apariencia }),
    };
    if (actual && mismaVilla) return this.prisma.local.update({ where: { id: actual.id }, data: datos });

    // Local nuevo o cambio de villa: primer lote libre (con reintento si otro lo toma a la vez).
    for (let intento = 0; intento < 5; intento++) {
      const ocupados = await this.prisma.local.findMany({
        where: { barrio: dto.barrio, ...(actual ? { NOT: { id: actual.id } } : {}) },
        select: { lote: true },
      });
      const lote = primerLoteLibre(ocupados.map((o) => o.lote));
      try {
        if (actual) return await this.prisma.local.update({ where: { id: actual.id }, data: { ...datos, lote } });
        return await this.prisma.$transaction(async (tx) => {
          const total = await tx.local.count({ where: { usuario_id: yo.id } });
          const local = await tx.local.create({ data: { ...datos, lote, usuario_id: yo.id } });
          if (total >= this.reglas.gratis) {
            // Se toma un pago sin usar; si dos pestañas abren a la vez, solo una lo consigue.
            const pago = await tx.pagoPlataforma.findFirst({ where: { usuario_id: yo.id, concepto: 'local_extra', local_id: null }, orderBy: { creado_en: 'asc' } });
            const tomado = pago ? await tx.pagoPlataforma.updateMany({ where: { id: pago.id, local_id: null }, data: { local_id: local.id } }) : { count: 0 };
            if (tomado.count !== 1) throw new ConflictException(`Para abrir otro local, paga ${this.reglas.precioExtraUsdc} USDC desde «Mis locales»`);
          }
          return local;
        });
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      }
    }
    throw new ConflictException('No se pudo asignar un lote, intenta de nuevo');
  }

  /**
   * Registra el pago de un local extra: una transferencia de USDC (`transfer` del token) desde una wallet
   * de la cuenta a la tesorería, por al menos el precio de reglas.ts. Si el servidor verifica, se lee en la red.
   */
  async registrarPago(yo: Usuario, hash: string, direccion: string, confirmada?: TransaccionConfirmada) {
    const s = this.config.stellar;
    if (!s.tesoreria || !s.tokenId) {
      throw new ServiceUnavailableException('El pago de locales extra todavía no está disponible en este servidor');
    }
    if (!(await esWalletDe(this.prisma, yo, direccion))) throw new ForbiddenException('Esa wallet no es de tu cuenta: súmala en tu perfil');
    const precio = this.reglas.precioExtraUsdc;
    const tx = hash.toLowerCase();
    let verificado = false;
    if (this.stellar.verificaPagos) {
      const r = confirmada ?? (await this.stellar.esperar(tx));
      if (r.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
        throw new BadRequestException(
          r.status === rpc.Api.GetTransactionStatus.FAILED ? 'Esa transacción falló en la red: no se movió dinero' : 'Todavía no encontramos esa transacción en la red; espera unos segundos',
        );
      }
      const inv = invocacionDeSobre(r.envelopeXdr, this.stellar.passphrase);
      const falla = (texto: string): never => {
        throw new BadRequestException(`Esa transacción no es el pago del local: ${texto}`);
      };
      if (!inv) falla('no es una llamada a un contrato');
      if (inv!.contrato !== s.tokenId) falla('no es un pago en USDC');
      if (inv!.funcion !== 'transfer') falla(`llama a "${inv!.funcion}" y el pago es una transferencia`);
      const [desde, hacia, monto] = inv!.args;
      if (desde !== direccion) falla('no la pagó esa wallet');
      if (hacia !== s.tesoreria) falla('el dinero no fue a la tesorería de Cryptoville');
      if (typeof monto !== 'bigint' || monto < BigInt(usdcAUnidades(precio))) falla(`el monto es menor que ${precio} USDC`);
      verificado = true;
    }
    try {
      return await this.prisma.pagoPlataforma.create({
        data: { usuario_id: yo.id, concepto: 'local_extra', monto_usdc: precio, tx_hash: tx, red: s.red, direccion, verificado },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Esa transacción ya se usó para otro pago');
      throw e;
    }
  }
}

@Controller()
@UseGuards(SesionGuard)
export class LocalesController {
  constructor(private readonly locales: LocalesService) {}

  /** Mis locales (abiertos o cerrados), del más antiguo al más nuevo, con el cupo. */
  @Get('mis-locales')
  async mios(@UsuarioActual() yo: Usuario) {
    const [locales, cupo] = await Promise.all([this.locales.propios(yo.id), this.locales.cupo(yo)]);
    return serializar({ locales, cupo });
  }

  /**
   * Crea o actualiza el local principal (el más antiguo). Se conserva igual que antes de v2:
   * quien tiene un solo local lo sigue usando así.
   */
  @Put('mi-local')
  async guardarPrincipal(@UsuarioActual() yo: Usuario, @Body() dto: LocalDto) {
    return serializar(await this.locales.guardar(yo, await this.locales.principal(yo.id), dto));
  }

  /** Abrir un local más. */
  @Post('locales')
  async abrir(@UsuarioActual() yo: Usuario, @Body() dto: LocalDto) {
    return serializar(await this.locales.guardar(yo, null, dto));
  }

  /** Editar uno de mis locales. */
  @Put('locales/:id')
  async editar(@UsuarioActual() yo: Usuario, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LocalDto) {
    return serializar(await this.locales.guardar(yo, await this.locales.propio(yo, id), dto));
  }

  /** Registrar el pago de un local extra hecho fuera de la app (Stellar Lab u otra wallet), con su hash. */
  @Post('locales/pago')
  @HttpCode(200)
  async pago(@UsuarioActual() yo: Usuario, @Body() dto: PagoLocalDto) {
    await this.locales.registrarPago(yo, dto.hash, dto.direccion);
    return this.locales.cupo(yo);
  }
}

@Module({ controllers: [LocalesController], providers: [LocalesService], exports: [LocalesService] })
export class LocalesModule {}
