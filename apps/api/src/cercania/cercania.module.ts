import {
  BadRequestException,
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Post,
  UseGuards,
} from '@nestjs/common';
import { reglasDe } from '@cryptoville/shared';
import { IsString, IsUUID, Length } from 'class-validator';
import { SesionGuard } from '../common/sesion.guard';
import { serializar } from '../common/serializar';
import { UsuarioActual } from '../common/usuario-actual';
import { CONFIGURACION, type Configuracion } from '../config/configuracion';
import type { Usuario } from '../generated/prisma/client';
import { ModeracionService } from '../moderacion/moderacion.module';
import { PrismaService } from '../prisma/prisma.service';

const HORA = 3_600_000;

class MensajeCercaniaDto {
  @IsUUID('4')
  para_id: string;

  @IsString()
  @Length(1, 280, { message: 'El mensaje puede tener hasta 280 caracteres' })
  texto: string;
}

/**
 * Chat por cercanía: dos personas que se cruzan en la villa se escriben (globo sobre la cabeza y una ventanita).
 * - Los mensajes van por aquí (con límite de frecuencia y respetando los bloqueos); a quien le escriben
 *   le llegan en vivo por Supabase Realtime.
 * - Se guardan `chatCercania.diasGuardado` días (reglas.ts), solo para revisar reportes, y después se borran solos.
 *   Los de una conversación con un reporte abierto se guardan hasta que el equipo lo revise.
 * - Las posiciones no pasan por aquí ni se guardan (Realtime Presence/Broadcast en la web).
 */
@Injectable()
export class CercaniaService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Cercania');
  private reloj: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly moderacion: ModeracionService,
    @Inject(CONFIGURACION) private readonly config: Configuracion,
  ) {}

  private get reglas() {
    return reglasDe(this.config.stellar.red).chatCercania;
  }

  onModuleInit(): void {
    // Reportar el chat es reportar a la persona con la que se habló: se revisa la conversación de los últimos días.
    this.moderacion.registrar(
      'chat',
      async (id) => (await this.prisma.usuario.findUnique({ where: { id }, select: { id: true } }))?.id ?? null,
      async (id) => {
        await this.prisma.mensajeCercania.updateMany({ where: { de_id: id }, data: { oculto: true } });
      },
    );
    if (this.config.entorno === 'test') return;
    this.reloj = setInterval(() => void this.limpiar().catch((e) => this.log.warn(`No se pudo limpiar el chat: ${String(e)}`)), HORA);
    this.reloj.unref?.();
    void this.limpiar().catch(() => undefined);
  }

  onModuleDestroy(): void {
    if (this.reloj) clearInterval(this.reloj);
  }

  async enviar(yo: Usuario, dto: MensajeCercaniaDto) {
    if (dto.para_id === yo.id) throw new BadRequestException('No puedes escribirte a ti mismo');
    const texto = dto.texto.trim();
    if (!texto) throw new BadRequestException('Escribe un mensaje');
    if (texto.length > this.reglas.largoMaximo) throw new BadRequestException(`El mensaje puede tener hasta ${this.reglas.largoMaximo} caracteres`);
    const para = await this.prisma.usuario.findUnique({ where: { id: dto.para_id }, select: { id: true, suspendido: true } });
    if (!para || para.suspendido) throw new NotFoundException('Esa persona ya no está en la villa');
    await this.moderacion.exigirSinBloqueo(yo.id, para.id);
    const recientes = await this.prisma.mensajeCercania.count({ where: { de_id: yo.id, creado_en: { gt: new Date(Date.now() - 60_000) } } });
    if (recientes >= this.reglas.mensajesPorMinuto) {
      throw new HttpException('Vas muy rápido: espera unos segundos antes de seguir escribiendo', HttpStatus.TOO_MANY_REQUESTS);
    }
    return this.prisma.mensajeCercania.create({ data: { de_id: yo.id, para_id: para.id, texto } });
  }

  /** Borra los mensajes viejos, salvo los de una conversación con un reporte de chat abierto. */
  async limpiar(): Promise<number> {
    const limite = new Date(Date.now() - this.reglas.diasGuardado * 24 * HORA);
    const borrados = await this.prisma.$executeRaw`
      DELETE FROM mensajes_cercania m
      WHERE m.creado_en < ${limite}
        AND NOT EXISTS (
          SELECT 1 FROM reportes r
          WHERE r.tipo = 'chat' AND r.estado = 'abierto'
            AND ((r.autor_id = m.para_id AND r.objeto_id = m.de_id::text) OR (r.autor_id = m.de_id AND r.objeto_id = m.para_id::text))
        )`;
    if (borrados) this.log.log(`Chat por cercanía: ${borrados} mensajes viejos borrados`);
    return borrados;
  }
}

@Controller('cercania')
@UseGuards(SesionGuard)
export class CercaniaController {
  constructor(private readonly cercania: CercaniaService) {}

  /** Mandar un mensaje a alguien que está cerca en la villa. */
  @Post('mensajes')
  async enviar(@UsuarioActual() yo: Usuario, @Body() dto: MensajeCercaniaDto) {
    return serializar(await this.cercania.enviar(yo, dto));
  }
}

@Module({ controllers: [CercaniaController], providers: [CercaniaService], exports: [CercaniaService] })
export class CercaniaModule {}
