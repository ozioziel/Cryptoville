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
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  COLORES_LOCAL,
  LOTES_POR_BARRIO,
  MAX_SERVICIOS_POR_LOCAL,
  type Barrio,
} from '@cryptoville/shared';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import { SesionGuard } from '../common/sesion.guard';
import { serializar } from '../common/serializar';
import { UsuarioActual } from '../common/usuario-actual';
import { CONFIGURACION, type Configuracion } from '../config/configuracion';
import { Prisma, type Usuario } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const BARRIOS = Object.keys(LOTES_POR_BARRIO) as Barrio[];
const PRECIO = /^\d{1,9}(\.\d{1,7})?$/;

class LocalDto {
  @IsString()
  @Length(2, 40, { message: 'El nombre del local debe tener entre 2 y 40 caracteres' })
  nombre: string;

  @IsIn(BARRIOS, { message: 'Elige un barrio: diseno, clases o tecnologia' })
  barrio: Barrio;

  @IsOptional()
  @IsString()
  @Length(0, 280)
  descripcion?: string;

  @IsOptional()
  @IsIn([...COLORES_LOCAL], { message: 'Color no permitido' })
  color?: string;
}

class ServicioDto {
  @IsString()
  @Length(3, 60, { message: 'El título debe tener entre 3 y 60 caracteres' })
  titulo: string;

  @IsString()
  @Length(10, 1000, { message: 'La descripción debe tener entre 10 y 1000 caracteres' })
  descripcion: string;

  @Matches(PRECIO, { message: 'Precio inválido (USDC, hasta 7 decimales)' })
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
  @IsOptional() @Matches(PRECIO, { message: 'Precio inválido (USDC, hasta 7 decimales)' }) precio_usdc?: string;
  @IsOptional() @IsInt() @Min(1) @Max(90) dias_entrega?: number;
  @IsOptional() @IsString() foto_url?: string | null;
  @IsOptional() @IsBoolean() activo?: boolean;
}

@Controller()
@UseGuards(SesionGuard)
export class ServicesController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONFIGURACION) private readonly config: Configuracion,
  ) {}

  /** Crea o actualiza el local del usuario. Asigna un lote libre del barrio elegido. */
  @Put('mi-local')
  async guardarLocal(@UsuarioActual() yo: Usuario, @Body() dto: LocalDto) {
    const actual = await this.prisma.local.findUnique({ where: { usuario_id: yo.id } });
    const datos = {
      nombre: dto.nombre.trim(),
      barrio: dto.barrio,
      descripcion: dto.descripcion?.trim() || null,
      color: dto.color ?? actual?.color ?? COLORES_LOCAL[0],
    };
    if (actual && actual.barrio === dto.barrio) {
      return serializar(await this.prisma.local.update({ where: { id: actual.id }, data: datos }));
    }
    // Local nuevo o cambio de barrio: buscar un lote libre (con reintento si otro lo toma a la vez).
    for (let intento = 0; intento < 3; intento++) {
      const ocupados = await this.prisma.local.findMany({
        where: { lote: { in: [...LOTES_POR_BARRIO[dto.barrio]] }, NOT: { usuario_id: yo.id } },
        select: { lote: true },
      });
      const libre = LOTES_POR_BARRIO[dto.barrio].find((l) => !ocupados.some((o) => o.lote === l));
      if (libre === undefined) throw new ConflictException('Ese barrio está lleno; elige otro');
      try {
        const local = actual
          ? await this.prisma.local.update({ where: { id: actual.id }, data: { ...datos, lote: libre } })
          : await this.prisma.local.create({ data: { ...datos, lote: libre, usuario_id: yo.id } });
        return serializar(local);
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      }
    }
    throw new ConflictException('No se pudo asignar un lote, intenta de nuevo');
  }

  @Post('servicios')
  async crearServicio(@UsuarioActual() yo: Usuario, @Body() dto: ServicioDto) {
    const local = await this.prisma.local.findUnique({ where: { usuario_id: yo.id } });
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

@Module({ controllers: [ServicesController] })
export class ServicesModule {}
