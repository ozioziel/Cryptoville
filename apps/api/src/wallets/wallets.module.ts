import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { METODOS_ENTRADA, VIGENCIA_DESAFIO_SEG, datosRed, mensajeVincularWallet, type MetodoEntrada } from '@cryptoville/shared';
import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import { randomBytes } from 'node:crypto';
import { esDireccionValida, verificarFirmaSep53 } from '../auth/firma-stellar';
import { SesionGuard } from '../common/sesion.guard';
import { serializar } from '../common/serializar';
import { UsuarioActual } from '../common/usuario-actual';
import { CONFIGURACION, type Configuracion } from '../config/configuracion';
import type { Usuario } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Tope de wallets por cuenta (para que nadie junte cientos). */
export const MAX_WALLETS = 10;

class DireccionDto {
  @Matches(/^G[A-Z2-7]{55}$/, { message: 'La dirección debe empezar con G y tener 56 caracteres' })
  direccion: string;
}

class VincularDto extends DireccionDto {
  @Matches(/^[0-9a-f]{32}$/, { message: 'Código inválido' })
  nonce: string;

  @IsString()
  @Length(64, 200, { message: 'Firma inválida' })
  firma: string;

  @IsOptional()
  @IsIn([...METODOS_ENTRADA], { message: 'Método inválido' })
  metodo?: MetodoEntrada;
}

/**
 * Wallets de la cuenta. La cuenta es la persona: puede sumar varias wallets y entrar con cualquiera.
 * - Para sumar una wallet, la wallet nueva firma un mensaje (así se prueba que es suya).
 * - La "wallet de la cuenta" (con la que se creó) no se puede quitar.
 * - "Para cobrar": donde cobra por defecto (una por cuenta).
 */
@Controller('wallets')
@UseGuards(SesionGuard)
export class WalletsController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONFIGURACION) private readonly config: Configuracion,
  ) {}

  @Get()
  async mias(@UsuarioActual() yo: Usuario) {
    return serializar(await this.prisma.wallet.findMany({ where: { usuario_id: yo.id }, orderBy: { agregada_en: 'asc' } }));
  }

  /** Paso 1: mensaje que firma la wallet nueva. */
  @Post('desafio')
  @HttpCode(200)
  @Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 20, ttl: 60_000 } })
  async desafio(@UsuarioActual() yo: Usuario, @Body() dto: DireccionDto) {
    if (!esDireccionValida(dto.direccion)) throw new BadRequestException('La dirección de la wallet no es válida');
    if (await this.prisma.wallet.findUnique({ where: { direccion: dto.direccion } })) {
      throw new ConflictException('Esa wallet ya está en una cuenta de Cryptoville');
    }
    if ((await this.prisma.wallet.count({ where: { usuario_id: yo.id } })) >= MAX_WALLETS) {
      throw new ConflictException(`Una cuenta puede tener hasta ${MAX_WALLETS} wallets`);
    }
    const nonce = randomBytes(16).toString('hex');
    const expira = new Date(Date.now() + VIGENCIA_DESAFIO_SEG * 1000);
    const mensaje = mensajeVincularWallet({
      direccion: dto.direccion,
      cuenta: yo.direccion,
      nonce,
      dominio: this.config.publicHost,
      emitido: new Date().toISOString(),
      red: datosRed(this.config.stellar.red).label,
    });
    await this.prisma.desafioLogin.create({
      data: { nonce, direccion: dto.direccion, mensaje, expira_en: expira, proposito: 'vincular', usuario_id: yo.id },
    });
    return { nonce, mensaje, expira_en: expira.toISOString() };
  }

  /** Paso 2: firma del mensaje → la wallet queda en la cuenta. */
  @Post('vincular')
  @Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 20, ttl: 60_000 } })
  async vincular(@UsuarioActual() yo: Usuario, @Body() dto: VincularDto) {
    const desafio = await this.prisma.desafioLogin.findUnique({ where: { nonce: dto.nonce } });
    if (
      !desafio ||
      desafio.direccion !== dto.direccion ||
      desafio.proposito !== 'vincular' ||
      desafio.usuario_id !== yo.id ||
      desafio.expira_en < new Date()
    ) {
      throw new UnauthorizedException('El código no es válido o ya venció; vuelve a intentarlo');
    }
    const marcado = await this.prisma.desafioLogin.updateMany({ where: { nonce: dto.nonce, usado: false }, data: { usado: true } });
    if (marcado.count !== 1) throw new UnauthorizedException('Ese código ya se usó; vuelve a intentarlo');
    if (!verificarFirmaSep53(dto.direccion, desafio.mensaje, dto.firma)) {
      throw new UnauthorizedException('La firma no corresponde a esa wallet');
    }
    if (dto.metodo === 'llave-prueba' && this.config.stellar.red === 'mainnet') {
      throw new ForbiddenException('En mainnet no se usan llaves de prueba');
    }
    try {
      const wallet = await this.prisma.wallet.create({
        data: { usuario_id: yo.id, direccion: dto.direccion, metodo: dto.metodo ?? 'wallet' },
      });
      return serializar(wallet);
    } catch {
      throw new ConflictException('Esa wallet ya está en una cuenta de Cryptoville');
    }
  }

  /** Elegir la wallet donde se cobra por defecto. */
  @Post(':id/cobrar')
  @HttpCode(200)
  async paraCobrar(@UsuarioActual() yo: Usuario, @Param('id', ParseUUIDPipe) id: string) {
    const wallet = await this.propia(yo, id);
    await this.prisma.$transaction([
      this.prisma.wallet.updateMany({ where: { usuario_id: yo.id, para_cobrar: true }, data: { para_cobrar: false } }),
      this.prisma.wallet.update({ where: { id: wallet.id }, data: { para_cobrar: true } }),
    ]);
    return serializar(await this.prisma.wallet.findMany({ where: { usuario_id: yo.id }, orderBy: { agregada_en: 'asc' } }));
  }

  /** Quitar una wallet (no la de la cuenta). Si era la de cobrar, se cobra en la de la cuenta. */
  @Delete(':id')
  @HttpCode(200)
  async quitar(@UsuarioActual() yo: Usuario, @Param('id', ParseUUIDPipe) id: string) {
    const wallet = await this.propia(yo, id);
    if (wallet.de_la_cuenta) throw new ForbiddenException('La wallet con la que creaste tu cuenta no se puede quitar');
    await this.prisma.$transaction(async (tx) => {
      await tx.wallet.delete({ where: { id: wallet.id } });
      if (wallet.para_cobrar) {
        await tx.wallet.updateMany({ where: { usuario_id: yo.id, de_la_cuenta: true }, data: { para_cobrar: true } });
      }
    });
    return serializar(await this.prisma.wallet.findMany({ where: { usuario_id: yo.id }, orderBy: { agregada_en: 'asc' } }));
  }

  private async propia(yo: Usuario, id: string) {
    const wallet = await this.prisma.wallet.findUnique({ where: { id } });
    if (!wallet || wallet.usuario_id !== yo.id) throw new NotFoundException('No tienes esa wallet');
    return wallet;
  }
}

/** Wallet donde cobra una persona (la "para cobrar", o la de la cuenta). */
export async function walletParaCobrar(prisma: PrismaService, usuario: Pick<Usuario, 'id' | 'direccion'>): Promise<string> {
  const w = await prisma.wallet.findFirst({ where: { usuario_id: usuario.id, para_cobrar: true }, select: { direccion: true } });
  return w?.direccion ?? usuario.direccion;
}

/** ¿Es esa wallet de la persona? */
export async function esWalletDe(prisma: PrismaService, usuario: Pick<Usuario, 'id' | 'direccion'>, direccion: string): Promise<boolean> {
  if (direccion === usuario.direccion) return true;
  const w = await prisma.wallet.findUnique({ where: { direccion }, select: { usuario_id: true } });
  return w?.usuario_id === usuario.id;
}

@Module({ controllers: [WalletsController] })
export class WalletsModule {}
