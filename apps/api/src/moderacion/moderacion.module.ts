import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Global,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { AvisosService } from '../avisos/avisos.service';
import { SesionGuard, SoloArbitro } from '../common/sesion.guard';
import { serializar } from '../common/serializar';
import { UsuarioActual } from '../common/usuario-actual';
import { Prisma, type Usuario } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const TIPOS_REPORTE = ['local', 'foto', 'busqueda', 'resena', 'mensaje', 'persona', 'proyecto', 'chat', 'trabajo_publico', 'cv'] as const;
export type TipoReporte = (typeof TIPOS_REPORTE)[number];
export const MOTIVOS_REPORTE = ['estafa', 'ofensivo', 'spam', 'ilegal', 'suplantacion', 'derechos', 'otro'] as const;

class ReporteDto {
  @IsIn(TIPOS_REPORTE, { message: 'No se puede reportar eso' })
  tipo: TipoReporte;

  @IsString()
  @Length(1, 100)
  objeto_id: string;

  @IsIn(MOTIVOS_REPORTE, { message: 'Elige un motivo' })
  motivo: (typeof MOTIVOS_REPORTE)[number];

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  detalle?: string;
}

class BloqueoDto {
  @IsUUID('4')
  usuario_id: string;
}

class ResolverReporteDto {
  /** descartar: no pasa nada · ocultar: se oculta el contenido · suspender: se suspende la cuenta denunciada. */
  @IsIn(['descartar', 'ocultar', 'suspender'])
  accion: 'descartar' | 'ocultar' | 'suspender';

  @IsString()
  @Length(5, 1000, { message: 'Explica la decisión (al menos 5 caracteres)' })
  resolucion: string;
}

/** Bloqueos y lo que ocultan. Lo usan los pedidos, las propuestas y el chat por cercanía. */
@Injectable()
export class ModeracionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly avisos: AvisosService,
  ) {}

  /** ¿Alguno de los dos bloqueó al otro? */
  async hayBloqueo(a: string, b: string): Promise<boolean> {
    const n = await this.prisma.bloqueo.count({
      where: { OR: [{ usuario_id: a, bloqueado_id: b }, { usuario_id: b, bloqueado_id: a }] },
    });
    return n > 0;
  }

  async exigirSinBloqueo(a: string, b: string): Promise<void> {
    if (await this.hayBloqueo(a, b)) throw new ForbiddenException('No puedes hacer esto: una de las dos personas bloqueó a la otra');
  }

  /** Dueño del contenido reportado (para saber a quién se denuncia). */
  async dueno(tipo: TipoReporte, objetoId: string): Promise<string | null> {
    const uuid = /^[0-9a-f-]{36}$/i.test(objetoId) ? objetoId : null;
    if (!uuid) return null;
    switch (tipo) {
      case 'local':
        return (await this.prisma.local.findUnique({ where: { id: uuid }, select: { usuario_id: true } }))?.usuario_id ?? null;
      case 'foto':
        return (await this.prisma.servicio.findUnique({ where: { id: uuid }, include: { local: true } }))?.local.usuario_id ?? null;
      case 'busqueda':
        return (await this.prisma.busqueda.findUnique({ where: { id: uuid }, select: { autor_id: true } }))?.autor_id ?? null;
      case 'resena':
        return (await this.prisma.resena.findUnique({ where: { id: uuid }, select: { autor_id: true } }))?.autor_id ?? null;
      case 'mensaje':
        return (await this.prisma.mensaje.findUnique({ where: { id: uuid }, select: { autor_id: true } }))?.autor_id ?? null;
      case 'persona':
        return (await this.prisma.usuario.findUnique({ where: { id: uuid }, select: { id: true } }))?.id ?? null;
      default:
        // proyecto, chat, trabajo_publico y cv: los resuelven sus módulos (portafolio, chat por cercanía, trabajos y CV) con `registrar`.
        return this.duenos.get(tipo)?.(uuid) ?? null;
    }
  }

  private readonly duenos = new Map<TipoReporte, (id: string) => Promise<string | null>>();
  private readonly ocultadores = new Map<TipoReporte, (id: string) => Promise<void>>();

  /** Otros módulos dicen cómo encontrar al dueño y cómo ocultar su contenido (portafolio, chat por cercanía). */
  registrar(tipo: TipoReporte, dueno: (id: string) => Promise<string | null>, ocultar: (id: string) => Promise<void>): void {
    this.duenos.set(tipo, dueno);
    this.ocultadores.set(tipo, ocultar);
  }

  async ocultar(tipo: TipoReporte, objetoId: string): Promise<void> {
    switch (tipo) {
      case 'local':
        await this.prisma.local.updateMany({ where: { id: objetoId }, data: { activo: false } });
        return;
      case 'foto':
        await this.prisma.servicio.updateMany({ where: { id: objetoId }, data: { foto_url: null } });
        return;
      case 'busqueda':
        await this.prisma.busqueda.updateMany({ where: { id: objetoId, estado: 'abierta' }, data: { estado: 'cancelada' } });
        return;
      case 'resena':
        await this.prisma.resena.updateMany({ where: { id: objetoId }, data: { oculta: true } });
        return;
      case 'mensaje':
        await this.prisma.mensaje.updateMany({ where: { id: objetoId }, data: { oculto: true } });
        return;
      case 'persona':
        return;
      default:
        await this.ocultadores.get(tipo)?.(objetoId);
    }
  }

  /** Suspende la cuenta: no puede escribir, y sus locales y «Se busca» dejan de verse. */
  async suspender(usuarioId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.usuario.update({ where: { id: usuarioId }, data: { suspendido: true } }),
      this.prisma.local.updateMany({ where: { usuario_id: usuarioId }, data: { activo: false } }),
      this.prisma.busqueda.updateMany({ where: { autor_id: usuarioId, estado: 'abierta' }, data: { estado: 'cancelada' } }),
    ]);
    await this.avisos.crear(
      usuarioId,
      'reporte_resuelto',
      'Tu cuenta fue suspendida por un reporte. Tus pedidos con dinero en garantía siguen en el contrato. Escríbenos desde «Enviar comentarios».',
    );
  }
}

@Controller()
@UseGuards(SesionGuard)
export class ModeracionController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moderacion: ModeracionService,
  ) {}

  /** Reportar contenido o a una persona. Le llega al equipo. */
  @Post('reportes')
  @Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 20, ttl: 60_000 } })
  async reportar(@UsuarioActual() yo: Usuario, @Body() dto: ReporteDto) {
    const denunciado = await this.moderacion.dueno(dto.tipo, dto.objeto_id);
    if (!denunciado) throw new NotFoundException('No encontramos lo que quieres reportar');
    if (denunciado === yo.id) throw new BadRequestException('No puedes reportarte a ti mismo');
    try {
      const reporte = await this.prisma.reporte.create({
        data: { autor_id: yo.id, tipo: dto.tipo, objeto_id: dto.objeto_id, denunciado_id: denunciado, motivo: dto.motivo, detalle: dto.detalle?.trim() || null },
      });
      return serializar(reporte);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Ya reportaste esto; el equipo lo está revisando');
      throw e;
    }
  }

  /** Bloquear a alguien: no te puede hablar ni mandarte pedidos ni propuestas. */
  @Post('bloqueos')
  async bloquear(@UsuarioActual() yo: Usuario, @Body() dto: BloqueoDto) {
    if (dto.usuario_id === yo.id) throw new BadRequestException('No puedes bloquearte a ti mismo');
    if (!(await this.prisma.usuario.findUnique({ where: { id: dto.usuario_id }, select: { id: true } }))) {
      throw new NotFoundException('No existe esa persona');
    }
    await this.prisma.bloqueo.upsert({
      where: { usuario_id_bloqueado_id: { usuario_id: yo.id, bloqueado_id: dto.usuario_id } },
      update: {},
      create: { usuario_id: yo.id, bloqueado_id: dto.usuario_id },
    });
    return { bloqueado: true };
  }

  @Delete('bloqueos/:usuarioId')
  @HttpCode(200)
  async desbloquear(@UsuarioActual() yo: Usuario, @Param('usuarioId', ParseUUIDPipe) usuarioId: string) {
    await this.prisma.bloqueo.deleteMany({ where: { usuario_id: yo.id, bloqueado_id: usuarioId } });
    return { bloqueado: false };
  }
}

/** Panel del equipo: la cola de reportes. */
@Controller('arbitro/reportes')
@UseGuards(SesionGuard)
@SoloArbitro()
export class ReportesEquipoController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moderacion: ModeracionService,
    private readonly avisos: AvisosService,
  ) {}

  @Get()
  async lista() {
    const reportes = await this.prisma.reporte.findMany({
      orderBy: [{ estado: 'asc' }, { creado_en: 'desc' }],
      take: 200,
      include: {
        autor: { select: { id: true, nombre: true } },
        denunciado: { select: { id: true, nombre: true, suspendido: true, verificado: true } },
      },
    });
    return serializar(reportes);
  }

  @Post(':id/resolver')
  @HttpCode(200)
  async resolver(@UsuarioActual() yo: Usuario, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResolverReporteDto) {
    const reporte = await this.prisma.reporte.findUnique({ where: { id } });
    if (!reporte) throw new NotFoundException('No existe ese reporte');
    if (reporte.estado !== 'abierto') throw new ConflictException('Ese reporte ya se revisó');
    if (reporte.denunciado_id === yo.id) throw new ForbiddenException('No puedes revisar un reporte contra ti');
    if (dto.accion === 'ocultar' || dto.accion === 'suspender') await this.moderacion.ocultar(reporte.tipo as TipoReporte, reporte.objeto_id);
    if (dto.accion === 'suspender' && reporte.denunciado_id) await this.moderacion.suspender(reporte.denunciado_id);
    const actualizado = await this.prisma.reporte.update({
      where: { id },
      data: { estado: dto.accion === 'descartar' ? 'descartado' : 'resuelto', resolucion: dto.resolucion.trim(), revisado_por: yo.id, revisado_en: new Date() },
    });
    await this.avisos.crear(
      reporte.autor_id,
      'reporte_resuelto',
      dto.accion === 'descartar' ? 'El equipo revisó tu reporte y no encontró un problema. Gracias por avisar.' : 'El equipo revisó tu reporte y tomó medidas. Gracias por avisar.',
    );
    return serializar(actualizado);
  }
}

@Global()
@Module({
  controllers: [ModeracionController, ReportesEquipoController],
  providers: [ModeracionService],
  exports: [ModeracionService],
})
export class ModeracionModule {}
