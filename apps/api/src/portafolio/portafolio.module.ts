import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  HttpCode,
  Inject,
  Injectable,
  Module,
  NotFoundException,
  OnModuleInit,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { reglasDe, videoExterno, type EnlaceProyecto, type VideoProyecto } from '@cryptoville/shared';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { SesionGuard } from '../common/sesion.guard';
import { serializar } from '../common/serializar';
import { UsuarioActual } from '../common/usuario-actual';
import { CONFIGURACION, type Configuracion } from '../config/configuracion';
import type { Prisma, Usuario } from '../generated/prisma/client';
import { ModeracionService } from '../moderacion/moderacion.module';
import { PrismaService } from '../prisma/prisma.service';

const FECHA = { strict: true };

class ExperienciaDto {
  @IsString()
  @Length(2, 80, { message: 'El puesto debe tener entre 2 y 80 caracteres' })
  puesto: string;

  @IsString()
  @Length(2, 80, { message: 'El lugar debe tener entre 2 y 80 caracteres' })
  lugar: string;

  @IsISO8601(FECHA, { message: 'Fecha de inicio inválida' })
  desde: string;

  /** null: sigue ahí. */
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsISO8601(FECHA, { message: 'Fecha de fin inválida' })
  hasta?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 600, { message: 'La descripción puede tener hasta 600 caracteres' })
  descripcion?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  orden?: number;
}

class EnlaceDto {
  @IsString()
  @Matches(/^https:\/\/[^\s]{4,490}$/, { message: 'Los enlaces tienen que empezar con https://' })
  url: string;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  titulo?: string;
}

class VideoDto {
  /** mux: un video subido a Cryptoville (Mux) · youtube / vimeo: un enlace. */
  @IsIn(['mux', 'youtube', 'vimeo'])
  tipo: 'mux' | 'youtube' | 'vimeo';

  @ValidateIf((o: VideoDto) => o.tipo === 'mux')
  @IsUUID('4')
  video_id?: string;

  @ValidateIf((o: VideoDto) => o.tipo !== 'mux')
  @IsString()
  @Length(10, 300)
  url?: string;
}

class ProyectoDto {
  @IsString()
  @Length(3, 80, { message: 'El título debe tener entre 3 y 80 caracteres' })
  titulo: string;

  @IsString()
  @Length(10, 2000, { message: 'Cuenta de qué se trata el proyecto (entre 10 y 2000 caracteres)' })
  descripcion: string;

  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsISO8601(FECHA, { message: 'Fecha inválida' })
  fecha?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  fotos?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => EnlaceDto)
  enlaces?: EnlaceDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => VideoDto)
  videos?: VideoDto[];

  /** Colgarlo como cuadro en la pared del interior de mis locales. */
  @IsOptional()
  @IsBoolean()
  destacado?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  orden?: number;
}

/**
 * Portafolio: experiencia previa y proyectos. Es público (la web lo lee de Supabase);
 * aquí solo se escribe. Los límites están en packages/shared/src/reglas.ts (`portafolio`).
 */
@Injectable()
export class PortafolioService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moderacion: ModeracionService,
    @Inject(CONFIGURACION) private readonly config: Configuracion,
  ) {}

  private get reglas() {
    return reglasDe(this.config.stellar.red);
  }

  /** Los reportes de un proyecto: el dueño es quien lo publicó y «ocultar» lo saca del portafolio. */
  onModuleInit(): void {
    this.moderacion.registrar(
      'proyecto',
      async (id) => (/^[0-9a-f-]{36}$/i.test(id) ? ((await this.prisma.proyecto.findUnique({ where: { id }, select: { usuario_id: true } }))?.usuario_id ?? null) : null),
      async (id) => {
        await this.prisma.proyecto.updateMany({ where: { id }, data: { oculto: true } });
      },
    );
  }

  async guardarExperiencia(yo: Usuario, id: string | null, dto: ExperienciaDto) {
    if (dto.hasta && dto.hasta < dto.desde) throw new BadRequestException('La fecha de fin no puede ser antes que la de inicio');
    const datos = {
      puesto: dto.puesto.trim(),
      lugar: dto.lugar.trim(),
      desde: new Date(dto.desde),
      hasta: dto.hasta ? new Date(dto.hasta) : null,
      descripcion: dto.descripcion?.trim() || null,
      orden: dto.orden ?? 0,
    };
    if (id) {
      await this.propia('experiencia', yo, id);
      return this.prisma.experiencia.update({ where: { id }, data: datos });
    }
    const max = this.reglas.portafolio.maxExperiencias;
    if ((await this.prisma.experiencia.count({ where: { usuario_id: yo.id } })) >= max) {
      throw new ConflictException(`Puedes guardar hasta ${max} experiencias`);
    }
    return this.prisma.experiencia.create({ data: { ...datos, usuario_id: yo.id } });
  }

  async guardarProyecto(yo: Usuario, id: string | null, dto: ProyectoDto) {
    const r = this.reglas.portafolio;
    const fotos = (dto.fotos ?? []).map((f) => this.validarFoto(f));
    const enlaces: EnlaceProyecto[] = (dto.enlaces ?? []).map((e) => ({ url: e.url.trim(), ...(e.titulo?.trim() ? { titulo: e.titulo.trim() } : {}) }));
    const videos = await Promise.all((dto.videos ?? []).map((v) => this.validarVideo(yo, v)));
    if (fotos.length + videos.length > r.maxMediosPorProyecto) {
      throw new BadRequestException(`Un proyecto puede tener hasta ${r.maxMediosPorProyecto} fotos y videos en total`);
    }
    const datos = {
      titulo: dto.titulo.trim(),
      descripcion: dto.descripcion.trim(),
      fecha: dto.fecha ? new Date(dto.fecha) : null,
      fotos,
      enlaces: enlaces as unknown as Prisma.InputJsonValue,
      videos: videos as unknown as Prisma.InputJsonValue,
      destacado: dto.destacado ?? false,
      orden: dto.orden ?? 0,
    };
    if (datos.destacado) {
      const otros = await this.prisma.proyecto.count({ where: { usuario_id: yo.id, destacado: true, ...(id ? { NOT: { id } } : {}) } });
      if (otros >= r.maxDestacados) throw new ConflictException(`En la pared caben ${r.maxDestacados} cuadros: quita otro proyecto destacado primero`);
    }
    if (id) {
      await this.propia('proyecto', yo, id);
      return this.prisma.proyecto.update({ where: { id }, data: datos });
    }
    if ((await this.prisma.proyecto.count({ where: { usuario_id: yo.id } })) >= r.maxProyectos) {
      throw new ConflictException(`Puedes guardar hasta ${r.maxProyectos} proyectos`);
    }
    return this.prisma.proyecto.create({ data: { ...datos, usuario_id: yo.id } });
  }

  async borrar(que: 'experiencia' | 'proyecto', yo: Usuario, id: string) {
    await this.propia(que, yo, id);
    if (que === 'experiencia') await this.prisma.experiencia.delete({ where: { id } });
    else await this.prisma.proyecto.delete({ where: { id } });
    return { ok: true };
  }

  /** Ids de proyectos propios y visibles, para adjuntarlos a una propuesta. */
  async proyectosPropios(yo: Pick<Usuario, 'id'>, ids: string[]): Promise<string[]> {
    const unicos = [...new Set(ids)];
    const max = this.reglas.portafolio.maxEnPropuesta;
    if (unicos.length > max) throw new BadRequestException(`Puedes adjuntar hasta ${max} proyectos`);
    if (!unicos.length) return [];
    const propios = await this.prisma.proyecto.findMany({ where: { id: { in: unicos }, usuario_id: yo.id, oculto: false }, select: { id: true } });
    if (propios.length !== unicos.length) throw new ForbiddenException('Solo puedes adjuntar proyectos de tu portafolio');
    return unicos;
  }

  private async propia(que: 'experiencia' | 'proyecto', yo: Usuario, id: string): Promise<void> {
    const fila =
      que === 'experiencia'
        ? await this.prisma.experiencia.findUnique({ where: { id }, select: { usuario_id: true } })
        : await this.prisma.proyecto.findUnique({ where: { id }, select: { usuario_id: true } });
    if (!fila) throw new NotFoundException(que === 'experiencia' ? 'No existe esa experiencia' : 'No existe ese proyecto');
    if (fila.usuario_id !== yo.id) throw new ForbiddenException('Eso no es de tu portafolio');
  }

  /** Solo fotos subidas al bucket "fotos" de este Supabase (igual que las de los servicios). */
  private validarFoto(url: string): string {
    const base = `${this.config.supabase.urlPublica}/storage/v1/object/public/fotos/`;
    if (!url.startsWith(base) || url.length > 500) throw new ForbiddenException('Las fotos deben subirse desde Cryptoville');
    return url;
  }

  /** Mux: un video propio subido para el portafolio · YouTube y Vimeo: solo los dominios de reglas.ts. */
  private async validarVideo(yo: Usuario, v: VideoDto): Promise<VideoProyecto> {
    if (v.tipo === 'mux') {
      const video = await this.prisma.video.findUnique({ where: { id: v.video_id! } });
      if (!video || video.usuario_id !== yo.id || video.uso !== 'portafolio') throw new ForbiddenException('Ese video no es de tu portafolio');
      if (video.estado === 'error') throw new BadRequestException('Ese video no se pudo procesar: súbelo de nuevo');
      return { tipo: 'mux', video_id: video.id, playback_id: video.playback_id };
    }
    const externo = videoExterno(v.url ?? '', this.reglas);
    if (!externo || externo.tipo !== v.tipo) throw new BadRequestException('Ese enlace de video no se puede mostrar: usa YouTube o Vimeo (https)');
    return externo;
  }
}

@Controller('portafolio')
@UseGuards(SesionGuard)
export class PortafolioController {
  constructor(private readonly portafolio: PortafolioService) {}

  @Post('experiencias')
  async nuevaExperiencia(@UsuarioActual() yo: Usuario, @Body() dto: ExperienciaDto) {
    return serializar(await this.portafolio.guardarExperiencia(yo, null, dto));
  }

  @Put('experiencias/:id')
  async editarExperiencia(@UsuarioActual() yo: Usuario, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ExperienciaDto) {
    return serializar(await this.portafolio.guardarExperiencia(yo, id, dto));
  }

  @Delete('experiencias/:id')
  @HttpCode(200)
  async borrarExperiencia(@UsuarioActual() yo: Usuario, @Param('id', ParseUUIDPipe) id: string) {
    return this.portafolio.borrar('experiencia', yo, id);
  }

  @Post('proyectos')
  async nuevoProyecto(@UsuarioActual() yo: Usuario, @Body() dto: ProyectoDto) {
    return serializar(await this.portafolio.guardarProyecto(yo, null, dto));
  }

  @Put('proyectos/:id')
  async editarProyecto(@UsuarioActual() yo: Usuario, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ProyectoDto) {
    return serializar(await this.portafolio.guardarProyecto(yo, id, dto));
  }

  @Delete('proyectos/:id')
  @HttpCode(200)
  async borrarProyecto(@UsuarioActual() yo: Usuario, @Param('id', ParseUUIDPipe) id: string) {
    return this.portafolio.borrar('proyecto', yo, id);
  }
}

@Module({ controllers: [PortafolioController], providers: [PortafolioService], exports: [PortafolioService] })
export class PortafolioModule {}
