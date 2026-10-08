import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  InternalServerErrorException,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { DOCUMENTOS_LEGALES, documentosPendientes, reglasDe } from '@cryptoville/shared';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Length, Max, Min, ValidateNested } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { PermitirSuspendido, SesionGuard, SoloArbitro } from '../common/sesion.guard';
import { serializar } from '../common/serializar';
import { UsuarioActual } from '../common/usuario-actual';
import { CONFIGURACION, type Configuracion } from '../config/configuracion';
import type { Usuario } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';

class DocumentoAceptadoDto {
  @IsIn(DOCUMENTOS_LEGALES.map((d) => d.id), { message: 'Documento desconocido' })
  id: string;

  @IsString()
  version: string;
}

class AceptarDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(DOCUMENTOS_LEGALES.length)
  @ValidateNested({ each: true })
  @Type(() => DocumentoAceptadoDto)
  documentos: DocumentoAceptadoDto[];
}

class ComentarioDto {
  @IsIn(['idea', 'error', 'otro'], { message: 'Elige si es una idea, un error u otra cosa' })
  tipo: 'idea' | 'error' | 'otro';

  @IsString()
  @Length(5, 2000, { message: 'Cuéntanos un poco más (entre 5 y 2000 caracteres)' })
  texto: string;

  /** Dónde estaba la persona (villa, panel abierto, navegador). */
  @IsOptional()
  @IsString()
  @Length(0, 500)
  contexto?: string;

  /** Ruta de la captura ya subida al bucket "capturas" (ver POST /comentarios/captura). */
  @IsOptional()
  @IsString()
  @Length(0, 300)
  captura_ruta?: string;
}

class CapturaDto {
  @IsIn(['image/png', 'image/jpeg', 'image/webp'], { message: 'Solo imágenes PNG, JPG o WEBP' })
  tipo: string;

  @IsInt()
  @Min(1)
  @Max(2 * 1024 * 1024, { message: 'La captura puede pesar hasta 2 MB' })
  tamano: number;
}

class EstadoComentarioDto {
  @IsIn(['nuevo', 'visto', 'resuelto'])
  estado: 'nuevo' | 'visto' | 'resuelto';
}

const EXTENSION: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/** Documentos legales: qué falta aceptar y registrar la aceptación (la versión vigente está en packages/shared). */
@Controller('legal')
@UseGuards(SesionGuard)
export class LegalController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('pendientes')
  async pendientes(@UsuarioActual() yo: Usuario) {
    const aceptados = await this.prisma.aceptacionLegal.findMany({ where: { usuario_id: yo.id }, select: { documento: true, version: true } });
    return documentosPendientes(aceptados);
  }

  @Post('aceptar')
  @HttpCode(200)
  async aceptar(@UsuarioActual() yo: Usuario, @Body() dto: AceptarDto) {
    for (const d of dto.documentos) {
      const vigente = DOCUMENTOS_LEGALES.find((x) => x.id === d.id);
      if (!vigente || vigente.version !== d.version) {
        throw new BadRequestException(`El documento «${vigente?.titulo ?? d.id}» cambió: recarga la página y vuelve a leerlo`);
      }
    }
    await this.prisma.aceptacionLegal.createMany({
      data: dto.documentos.map((d) => ({ usuario_id: yo.id, documento: d.id, version: d.version })),
      skipDuplicates: true,
    });
    return this.pendientes(yo);
  }
}

/** «Enviar comentarios»: ideas y errores para el equipo (con sesión, para poder responder). */
@Controller('comentarios')
export class ComentariosController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
    @Inject(CONFIGURACION) private readonly config: Configuracion,
  ) {}

  @Post()
  @UseGuards(SesionGuard)
  @PermitirSuspendido()
  @Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 10, ttl: 60_000 } })
  async crear(@UsuarioActual() yo: Usuario, @Body() dto: ComentarioDto) {
    if (dto.captura_ruta && !dto.captura_ruta.startsWith(`usuarios/${yo.id}/`)) {
      throw new BadRequestException('La captura tiene que subirse desde Cryptoville');
    }
    const comentario = await this.prisma.comentario.create({
      data: {
        usuario_id: yo.id,
        tipo: dto.tipo,
        texto: dto.texto.trim(),
        contexto: dto.contexto?.trim() || null,
        captura_ruta: dto.captura_ruta || null,
      },
    });
    return serializar(comentario);
  }

  /** URL firmada para subir UNA captura al bucket privado "capturas". */
  @Post('captura')
  @UseGuards(SesionGuard)
  @Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 10, ttl: 60_000 } })
  async captura(@UsuarioActual() yo: Usuario, @Body() dto: CapturaDto) {
    if (dto.tamano > reglasDe(this.config.stellar.red).archivos.capturaMaxBytes) throw new BadRequestException('La captura puede pesar hasta 2 MB');
    const ruta = `usuarios/${yo.id}/${randomUUID()}.${EXTENSION[dto.tipo]}`;
    const { data, error } = await this.supabase.admin.storage.from('capturas').createSignedUploadUrl(ruta);
    if (error || !data) throw new InternalServerErrorException('No se pudo preparar la subida');
    return { ruta, token: data.token };
  }
}

/** Panel del equipo: comentarios recibidos (las capturas se abren con una URL firmada que dura 10 minutos). */
@Controller('arbitro/comentarios')
@UseGuards(SesionGuard)
@SoloArbitro()
export class ComentariosEquipoController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
    @Inject(CONFIGURACION) private readonly config: Configuracion,
  ) {}

  @Get()
  async lista() {
    const comentarios = await this.prisma.comentario.findMany({
      orderBy: [{ estado: 'asc' }, { creado_en: 'desc' }],
      take: 200,
      include: { usuario: { select: { id: true, nombre: true } } },
    });
    const conCaptura = await Promise.all(
      comentarios.map(async (c) => {
        if (!c.captura_ruta) return { ...c, captura_url: null };
        const { data } = await this.supabase.admin.storage.from('capturas').createSignedUrl(c.captura_ruta, 600);
        return { ...c, captura_url: data?.signedUrl?.replace(this.config.supabase.url, this.config.supabase.urlPublica) ?? null };
      }),
    );
    return serializar(conCaptura);
  }

  @Patch(':id')
  async estado(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EstadoComentarioDto) {
    const existe = await this.prisma.comentario.findUnique({ where: { id } });
    if (!existe) throw new NotFoundException('No existe ese comentario');
    return serializar(await this.prisma.comentario.update({ where: { id }, data: { estado: dto.estado } }));
  }
}

@Module({ controllers: [LegalController, ComentariosController, ComentariosEquipoController] })
export class LegalModule {}
