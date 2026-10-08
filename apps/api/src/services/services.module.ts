import {
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  HttpCode,
  Inject,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { MAX_SERVICIOS_POR_LOCAL } from '@cryptoville/shared';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';
import { SesionGuard } from '../common/sesion.guard';
import { serializar } from '../common/serializar';
import { UsuarioActual } from '../common/usuario-actual';
import { CONFIGURACION, type Configuracion } from '../config/configuracion';
import type { Usuario } from '../generated/prisma/client';
import { LocalesModule, LocalesService } from '../locales/locales.module';
import { PrismaService } from '../prisma/prisma.service';
import { MONTO_USDC } from '../common/montos';


class ServicioDto {
  /** Local donde se publica (si tienes varios). Si no viene, el principal. */
  @IsOptional()
  @IsUUID('4')
  local_id?: string;

  @IsString()
  @Length(3, 60, { message: 'El título debe tener entre 3 y 60 caracteres' })
  titulo: string;

  @IsString()
  @Length(10, 1000, { message: 'La descripción debe tener entre 10 y 1000 caracteres' })
  descripcion: string;

  @Matches(MONTO_USDC, { message: 'Precio inválido (USDC mayor que 0, hasta 7 decimales)' })
  precio_usdc: string;

  @IsInt()
  @Min(1)
  @Max(90)
  dias_entrega: number;

  @IsOptional()
  @IsString()
  foto_url?: string | null;
}

class ServicioParcialDto {
  @IsOptional() @IsString() @Length(3, 60) titulo?: string;
  @IsOptional() @IsString() @Length(10, 1000) descripcion?: string;
  @IsOptional() @Matches(MONTO_USDC, { message: 'Precio inválido (USDC mayor que 0, hasta 7 decimales)' }) precio_usdc?: string;
  @IsOptional() @IsInt() @Min(1) @Max(90) dias_entrega?: number;
  @IsOptional() @IsString() foto_url?: string | null;
  @IsOptional() @IsBoolean() activo?: boolean;
}

@Controller()
@UseGuards(SesionGuard)
export class ServicesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locales: LocalesService,
    @Inject(CONFIGURACION) private readonly config: Configuracion,
  ) {}

  // PUT /mi-local (el local principal), POST /locales y PUT /locales/:id están en locales/locales.module.ts.

  @Post('servicios')
  async crearServicio(@UsuarioActual() yo: Usuario, @Body() dto: ServicioDto) {
    const local = dto.local_id ? await this.locales.propio(yo, dto.local_id) : await this.locales.principal(yo.id);
    if (!local) throw new ConflictException('Primero abre tu local');
    const cantidad = await this.prisma.servicio.count({ where: { local_id: local.id, activo: true } });
    if (cantidad >= MAX_SERVICIOS_POR_LOCAL) {
      throw new ConflictException(`Un local puede tener hasta ${MAX_SERVICIOS_POR_LOCAL} servicios activos`);
    }
    const servicio = await this.prisma.servicio.create({
      data: {
        local_id: local.id,
        titulo: dto.titulo.trim(),
        descripcion: dto.descripcion.trim(),
        precio_usdc: dto.precio_usdc,
        dias_entrega: dto.dias_entrega,
        foto_url: this.validarFoto(dto.foto_url),
      },
    });
    return serializar(servicio);
  }

  @Patch('servicios/:id')
  async editarServicio(
    @UsuarioActual() yo: Usuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ServicioParcialDto,
  ) {
    await this.servicioPropio(yo, id);
    const servicio = await this.prisma.servicio.update({
      where: { id },
      data: {
        titulo: dto.titulo?.trim(),
        descripcion: dto.descripcion?.trim(),
        precio_usdc: dto.precio_usdc,
        dias_entrega: dto.dias_entrega,
        foto_url: dto.foto_url === undefined ? undefined : this.validarFoto(dto.foto_url),
        activo: dto.activo,
      },
    });
    return serializar(servicio);
  }

  /** Los servicios no se borran (los pedidos los referencian): se desactivan. */
  @Delete('servicios/:id')
  @HttpCode(200)
  async desactivarServicio(@UsuarioActual() yo: Usuario, @Param('id', ParseUUIDPipe) id: string) {
    await this.servicioPropio(yo, id);
    return serializar(await this.prisma.servicio.update({ where: { id }, data: { activo: false } }));
  }

  private async servicioPropio(yo: Usuario, id: string) {
    const servicio = await this.prisma.servicio.findUnique({ where: { id }, include: { local: true } });
    if (!servicio) throw new NotFoundException('No existe ese servicio');
    if (servicio.local.usuario_id !== yo.id) throw new ForbiddenException('Ese servicio no es tuyo');
    return servicio;
  }

  /** Solo se aceptan fotos subidas al bucket "fotos" de este Supabase. */
  private validarFoto(url: string | null | undefined): string | null {
    if (!url) return null;
    const base = `${this.config.supabase.urlPublica}/storage/v1/object/public/fotos/`;
    if (!url.startsWith(base) || url.length > 500) {
      throw new ForbiddenException('La foto debe subirse desde Cryptoville');
    }
    return url;
  }
}

@Module({ imports: [LocalesModule], controllers: [ServicesController] })
export class ServicesModule {}
