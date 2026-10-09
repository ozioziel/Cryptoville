import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  HttpCode,
  Inject,
  Injectable,
  InternalServerErrorException,
  Module,
  NotFoundException,
  OnModuleInit,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { NIVELES_IDIOMA, reglasDe, type Idioma, type NivelIdioma } from '@cryptoville/shared';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Matches, Min, ValidateIf, ValidateNested } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { SesionGuard } from '../common/sesion.guard';
import { serializar } from '../common/serializar';
import { UsuarioActual } from '../common/usuario-actual';
import { CONFIGURACION, type Configuracion } from '../config/configuracion';
import type { Prisma, Usuario } from '../generated/prisma/client';
import { ModeracionService } from '../moderacion/moderacion.module';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';

/** Bucket público de los CV en PDF (máx. 5 MB, solo PDF: lo limita también el bucket). */
export const BUCKET_CVS = 'cvs';
const RUTA_PDF = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/;

class IdiomaDto {
  @IsString()
  @Length(2, 40, { message: 'Cada idioma debe tener entre 2 y 40 caracteres' })
  idioma: string;

  @IsIn(NIVELES_IDIOMA, { message: 'Elige el nivel: básico, intermedio, avanzado o nativo' })
  nivel: NivelIdioma;
}

class CvDto {
  /** null: borrar. */
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsString()
  acerca_de?: string | null;

  @IsOptional()
  @IsBoolean()
  acerca_publico?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  habilidades?: string[];

  @IsOptional()
  @IsBoolean()
  habilidades_publicas?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => IdiomaDto)
  idiomas?: IdiomaDto[];

  @IsOptional()
  @IsBoolean()
  idiomas_publicos?: boolean;

  @IsOptional()
  @IsBoolean()
  pdf_publico?: boolean;
}

class SubidaPdfDto {
  @IsIn(['application/pdf'], { message: 'El CV tiene que ser un PDF' })
  tipo: string;

  @IsInt()
  @Min(1)
  tamano: number;
}

class PdfDto {
  @IsString()
  @Matches(RUTA_PDF, { message: 'Ruta de archivo inválida' })
  ruta: string;
}

/**
 * El CV de la Plaza principal: acerca de mí, habilidades, idiomas y el PDF. La web lo lee de Supabase
 * (la dueña, de la tabla `cvs`; los demás, de la vista `cvs_publicos`, que solo trae lo público).
 * Aquí solo se escribe. Las secciones (experiencia, educación…) van por /api/portafolio.
 */
@Injectable()
export class CvService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
    private readonly moderacion: ModeracionService,
    @Inject(CONFIGURACION) private readonly config: Configuracion,
  ) {}

  private get reglas() {
    return reglasDe(this.config.stellar.red).cv;
  }

  /** Reportar un CV: el objeto es la persona (su usuario_id) y «ocultar» lo saca de la Plaza. */
  onModuleInit(): void {
    this.moderacion.registrar(
      'cv',
      async (id) => (await this.prisma.cv.findUnique({ where: { usuario_id: id }, select: { usuario_id: true } }))?.usuario_id ?? null,
      async (id) => {
        await this.prisma.cv.updateMany({ where: { usuario_id: id }, data: { oculto: true } });
      },
    );
  }

  async guardar(yo: Usuario, dto: CvDto) {
    const r = this.reglas;
    const datos: Prisma.CvUncheckedCreateInput = { usuario_id: yo.id };
    if (dto.acerca_de !== undefined) {
      const texto = dto.acerca_de?.trim() || null;
      if (texto && texto.length > r.largoAcercaDe) throw new BadRequestException(`«Acerca de mí» puede tener hasta ${r.largoAcercaDe} caracteres`);
      datos.acerca_de = texto;
    }
    if (dto.habilidades !== undefined) {
      const vistas = new Set<string>();
      const habilidades: string[] = [];
      for (const h of dto.habilidades.map((x) => x.trim().replace(/\s+/g, ' ')).filter(Boolean)) {
        if (h.length > r.largoHabilidad) throw new BadRequestException(`Cada habilidad puede tener hasta ${r.largoHabilidad} caracteres`);
        if (vistas.has(h.toLowerCase())) continue;
        vistas.add(h.toLowerCase());
        habilidades.push(h);
      }
      if (habilidades.length > r.maxHabilidades) throw new BadRequestException(`Puedes poner hasta ${r.maxHabilidades} habilidades`);
      datos.habilidades = habilidades;
    }
    if (dto.idiomas !== undefined) {
      if (dto.idiomas.length > r.maxIdiomas) throw new BadRequestException(`Puedes poner hasta ${r.maxIdiomas} idiomas`);
      const idiomas: Idioma[] = dto.idiomas.map((i) => ({ idioma: i.idioma.trim(), nivel: i.nivel }));
      datos.idiomas = idiomas as unknown as Prisma.InputJsonValue;
    }
    for (const campo of ['acerca_publico', 'habilidades_publicas', 'idiomas_publicos', 'pdf_publico'] as const) {
      if (dto[campo] !== undefined) datos[campo] = dto[campo];
    }
    const { usuario_id: _, ...cambios } = datos;
    return this.prisma.cv.upsert({ where: { usuario_id: yo.id }, create: datos, update: cambios });
  }

  /** URL firmada para subir el PDF (una sola vez) a la carpeta de la persona en el bucket `cvs`. */
  async prepararPdf(yo: Usuario, dto: SubidaPdfDto) {
    const max = this.reglas.pdfMaxBytes;
    if (dto.tamano > max) throw new BadRequestException(`El PDF puede pesar hasta ${Math.round(max / 1024 / 1024)} MB`);
    const ruta = `${yo.id}/${randomUUID()}.pdf`;
    const { data, error } = await this.supabase.admin.storage.from(BUCKET_CVS).createSignedUploadUrl(ruta);
    if (error || !data) throw new InternalServerErrorException('No se pudo preparar la subida');
    return { ruta, token: data.token, url_subida: data.signedUrl.replace(this.config.supabase.url, this.config.supabase.urlPublica) };
  }

  /** Después de subirlo: se comprueba que el archivo esté (PDF y del tamaño permitido) y queda en el CV. */
  async confirmarPdf(yo: Usuario, ruta: string) {
    if (!ruta.startsWith(`${yo.id}/`)) throw new ForbiddenException('Ese archivo no es tuyo');
    const [carpeta, nombre] = ruta.split('/');
    const { data, error } = await this.supabase.admin.storage.from(BUCKET_CVS).list(carpeta, { search: nombre, limit: 1 });
    const archivo = data?.find((a) => a.name === nombre);
    if (error || !archivo) throw new NotFoundException('No encontramos el PDF: súbelo de nuevo');
    const meta = (archivo.metadata ?? {}) as { mimetype?: string; size?: number };
    if (meta.mimetype !== 'application/pdf' || (meta.size ?? 0) > this.reglas.pdfMaxBytes) {
      await this.supabase.admin.storage.from(BUCKET_CVS).remove([ruta]);
      throw new BadRequestException('El CV tiene que ser un PDF de hasta 5 MB');
    }
    const antes = await this.prisma.cv.findUnique({ where: { usuario_id: yo.id }, select: { pdf_ruta: true } });
    const cv = await this.prisma.cv.upsert({ where: { usuario_id: yo.id }, create: { usuario_id: yo.id, pdf_ruta: ruta }, update: { pdf_ruta: ruta } });
    if (antes?.pdf_ruta && antes.pdf_ruta !== ruta) await this.supabase.admin.storage.from(BUCKET_CVS).remove([antes.pdf_ruta]);
    return cv;
  }

  async quitarPdf(yo: Usuario) {
    const antes = await this.prisma.cv.findUnique({ where: { usuario_id: yo.id }, select: { pdf_ruta: true } });
    if (!antes?.pdf_ruta) return { quitado: false };
    await this.prisma.cv.update({ where: { usuario_id: yo.id }, data: { pdf_ruta: null } });
    await this.supabase.admin.storage.from(BUCKET_CVS).remove([antes.pdf_ruta]);
    return { quitado: true };
  }
}

@Controller('cv')
@UseGuards(SesionGuard)
export class CvController {
  constructor(private readonly cv: CvService) {}

  /** Acerca de mí, habilidades, idiomas y qué es público (solo se cambia lo que se manda). */
  @Put()
  async guardar(@UsuarioActual() yo: Usuario, @Body() dto: CvDto) {
    return serializar(await this.cv.guardar(yo, dto));
  }

  @Post('pdf')
  @HttpCode(200)
  async prepararPdf(@UsuarioActual() yo: Usuario, @Body() dto: SubidaPdfDto) {
    return this.cv.prepararPdf(yo, dto);
  }

  @Put('pdf')
  async confirmarPdf(@UsuarioActual() yo: Usuario, @Body() dto: PdfDto) {
    return serializar(await this.cv.confirmarPdf(yo, dto.ruta));
  }

  @Delete('pdf')
  @HttpCode(200)
  async quitarPdf(@UsuarioActual() yo: Usuario) {
    return this.cv.quitarPdf(yo);
  }
}

@Module({ controllers: [CvController], providers: [CvService] })
export class CvModule {}
