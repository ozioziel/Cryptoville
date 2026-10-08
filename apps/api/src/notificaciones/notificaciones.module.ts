import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Inject,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUrl, Length, Matches, ValidateIf, ValidateNested } from 'class-validator';
import { randomBytes } from 'node:crypto';
import webpush from 'web-push';
import { SesionGuard } from '../common/sesion.guard';
import { serializar } from '../common/serializar';
import { UsuarioActual } from '../common/usuario-actual';
import { CONFIGURACION, type Configuracion } from '../config/configuracion';
import type { Usuario } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

class LlavesPushDto {
  @IsString()
  @Length(10, 200)
  p256dh: string;

  @IsString()
  @Length(10, 100)
  auth: string;
}

class SuscripcionDto {
  @IsUrl({ protocols: ['https'], require_tld: true }, { message: 'Suscripción inválida' })
  @Length(10, 1000)
  endpoint: string;

  @ValidateNested()
  @Type(() => LlavesPushDto)
  keys: LlavesPushDto;
}

class QuitarSuscripcionDto {
  @IsString()
  @Length(10, 1000)
  endpoint: string;
}

class PreferenciasDto {
  /** Correo para los avisos (null = quitarlo). Hay que confirmarlo con el enlace que llega. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(CORREO, { message: 'Ese correo no parece válido' })
  @Length(5, 200)
  correo?: string | null;

  @IsOptional()
  @IsBoolean()
  por_correo?: boolean;

  @IsOptional()
  @IsBoolean()
  por_push?: boolean;
}

class VerificarCorreoDto {
  @Matches(/^[0-9a-f]{48}$/, { message: 'Enlace inválido' })
  token: string;
}

/** Escapa texto para meterlo en el HTML de un correo. */
function html(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * Avisos fuera de la app.
 * - Notificaciones del navegador (Web Push): si el servidor tiene VAPID_* y la persona las activó en ese dispositivo.
 * - Correo (Resend): si el servidor tiene RESEND_API_KEY y la persona confirmó su correo.
 * Si falta la configuración, no se manda nada y la app sigue igual (los avisos dentro de la app siempre llegan).
 */
@Injectable()
export class NotificacionesService {
  private readonly log = new Logger('Notificaciones');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONFIGURACION) private readonly config: Configuracion,
  ) {
    const push = config.servicios.push;
    if (push) webpush.setVapidDetails(push.contacto, push.publica, push.privada);
  }

  /** Manda un aviso por los canales que la persona tenga activos. Nunca lanza errores (es un extra). */
  async enviar(usuarioId: string, texto: string, destino: { pedidoId?: string | null; busquedaId?: string | null } = {}): Promise<void> {
    if (this.config.entorno === 'test') return;
    if (!this.config.servicios.push && !this.config.servicios.correo) return;
    try {
      const preferencias = await this.prisma.preferenciasAvisos.findUnique({ where: { usuario_id: usuarioId } });
      const url = this.enlace(destino);
      if (this.config.servicios.push && (preferencias?.por_push ?? true)) await this.push(usuarioId, texto, url);
      if (this.config.servicios.correo && preferencias?.por_correo && preferencias.correo_verificado && preferencias.correo) {
        await this.correo(preferencias.correo, 'Tienes un aviso en Cryptoville', texto, url, 'Ver en Cryptoville');
      }
    } catch (e) {
      this.log.warn(`No se pudo mandar un aviso: ${String((e as Error).message).slice(0, 160)}`);
    }
  }

  enlace(destino: { pedidoId?: string | null; busquedaId?: string | null }): string {
    if (destino.pedidoId) return `${this.config.urlPublica}/?pedido=${destino.pedidoId}`;
    if (destino.busquedaId) return `${this.config.urlPublica}/?se-busca=${destino.busquedaId}`;
    return `${this.config.urlPublica}/`;
  }

  private async push(usuarioId: string, texto: string, url: string): Promise<void> {
    const suscripciones = await this.prisma.suscripcionPush.findMany({ where: { usuario_id: usuarioId } });
    const carga = JSON.stringify({ titulo: 'Cryptoville', texto, url });
    for (const s of suscripciones) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, carga, { TTL: 24 * 3600 });
      } catch (e) {
        const estado = (e as { statusCode?: number }).statusCode;
        // El navegador ya no acepta esta suscripción: se borra.
        if (estado === 404 || estado === 410) await this.prisma.suscripcionPush.deleteMany({ where: { id: s.id } });
      }
    }
  }

  async correo(para: string, asunto: string, texto: string, url: string, boton: string): Promise<boolean> {
    const c = this.config.servicios.correo;
    if (!c) return false;
    const cuerpo = `<div style="font-family:system-ui,sans-serif;color:#3b2a25;max-width:520px">
<p style="font-size:16px">${html(texto)}</p>
<p><a href="${html(url)}" style="display:inline-block;background:#e07a5f;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:700">${html(boton)}</a></p>
<p style="color:#7a6a5f;font-size:12px">Recibes este correo porque activaste los avisos en tu perfil de Cryptoville.</p>
</div>`;
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${c.resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: c.remitente, to: [para], subject: asunto, html: cuerpo, text: `${texto}\n\n${url}` }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!r?.ok) this.log.warn(`Resend no mandó el correo (${r?.status ?? 'sin respuesta'})`);
    return Boolean(r?.ok);
  }
}

@Controller('notificaciones')
export class NotificacionesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificaciones: NotificacionesService,
    @Inject(CONFIGURACION) private readonly config: Configuracion,
  ) {}

  /** Activar las notificaciones en este navegador. */
  @Post('push')
  @UseGuards(SesionGuard)
  async suscribir(@UsuarioActual() yo: Usuario, @Body() dto: SuscripcionDto) {
    if (!this.config.servicios.push) throw new BadRequestException('Las notificaciones no están activas en este servidor');
    await this.prisma.suscripcionPush.upsert({
      where: { endpoint: dto.endpoint },
      update: { usuario_id: yo.id, p256dh: dto.keys.p256dh, auth: dto.keys.auth },
      create: { usuario_id: yo.id, endpoint: dto.endpoint, p256dh: dto.keys.p256dh, auth: dto.keys.auth },
    });
    return { activas: true };
  }

  @Post('push/quitar')
  @HttpCode(200)
  @UseGuards(SesionGuard)
  async quitar(@UsuarioActual() yo: Usuario, @Body() dto: QuitarSuscripcionDto) {
    await this.prisma.suscripcionPush.deleteMany({ where: { usuario_id: yo.id, endpoint: dto.endpoint } });
    return { activas: false };
  }

  /** Correo y canales. Si cambia el correo, hay que volver a confirmarlo. */
  @Put('preferencias')
  @UseGuards(SesionGuard)
  @Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 10, ttl: 60_000 } })
  async preferencias(@UsuarioActual() yo: Usuario, @Body() dto: PreferenciasDto) {
    const actual = await this.prisma.preferenciasAvisos.findUnique({ where: { usuario_id: yo.id } });
    const correo = dto.correo === undefined ? (actual?.correo ?? null) : dto.correo?.trim().toLowerCase() || null;
    const cambio = correo !== (actual?.correo ?? null);
    const token = cambio && correo ? randomBytes(24).toString('hex') : (actual?.token_correo ?? null);
    const datos = {
      correo,
      ...(cambio ? { correo_verificado: false, token_correo: correo ? token : null } : {}),
      por_correo: dto.por_correo ?? actual?.por_correo ?? false,
      por_push: dto.por_push ?? actual?.por_push ?? true,
    };
    const guardado = await this.prisma.preferenciasAvisos.upsert({ where: { usuario_id: yo.id }, update: datos, create: { usuario_id: yo.id, ...datos } });
    let enviado = false;
    if (cambio && correo && token) {
      enviado = await this.notificaciones.correo(
        correo,
        'Confirma tu correo en Cryptoville',
        'Para recibir los avisos de Cryptoville en este correo, confírmalo con este botón.',
        `${this.config.urlPublica}/?correo=${token}`,
        'Confirmar mi correo',
      );
    }
    const { token_correo: _oculto, ...publico } = guardado;
    return serializar({ ...publico, correo_enviado: enviado, correo_disponible: Boolean(this.config.servicios.correo) });
  }

  /** Confirmar el correo con el enlace que llegó (no hace falta sesión: el token es de un solo uso). */
  @Post('correo/verificar')
  @HttpCode(200)
  @Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 10, ttl: 60_000 } })
  async verificarCorreo(@Body() dto: VerificarCorreoDto) {
    const p = await this.prisma.preferenciasAvisos.findUnique({ where: { token_correo: dto.token } });
    if (!p) throw new NotFoundException('El enlace no es válido o ya se usó');
    await this.prisma.preferenciasAvisos.update({
      where: { usuario_id: p.usuario_id },
      data: { correo_verificado: true, token_correo: null, por_correo: true },
    });
    return { confirmado: true };
  }
}

@Module({ controllers: [NotificacionesController], providers: [NotificacionesService], exports: [NotificacionesService] })
export class NotificacionesModule {}
