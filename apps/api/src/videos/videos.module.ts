import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Global,
  HttpCode,
  Inject,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
  type RawBodyRequest,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { reglasDe } from '@cryptoville/shared';
import { IsIn } from 'class-validator';
import type { Request } from 'express';
import { createHmac, createSign, randomUUID, timingSafeEqual } from 'node:crypto';
import { SesionGuard } from '../common/sesion.guard';
import { serializar } from '../common/serializar';
import { UsuarioActual } from '../common/usuario-actual';
import { CONFIGURACION, type Configuracion } from '../config/configuracion';
import type { Usuario, Video } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const MUX = 'https://api.mux.com';
const TOLERANCIA_SEG = 300;

class SubidaDto {
  /** prueba (privado: se ve con un token) o portafolio (público). */
  @IsIn(['prueba', 'portafolio'])
  uso: 'prueba' | 'portafolio';
}

/** Firma del webhook de Mux: "mux-signature: t=…,v1=…", HMAC-SHA256 de "t.cuerpo" con el secreto. */
export function firmaMuxValida(secreto: string, cuerpo: Buffer, cabecera: string | undefined, ahora = Date.now()): boolean {
  if (!cabecera) return false;
  const partes = Object.fromEntries(cabecera.split(',').map((p) => p.trim().split('=') as [string, string]));
  const t = Number(partes.t);
  if (!partes.v1 || !Number.isFinite(t) || Math.abs(ahora / 1000 - t) > TOLERANCIA_SEG) return false;
  const esperada = createHmac('sha256', secreto).update(`${partes.t}.`).update(cuerpo).digest('hex');
  const a = Buffer.from(esperada);
  const b = Buffer.from(partes.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

const base64url = (b: Buffer | string) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** Token firmado (RS256) para ver un video privado de Mux: `aud` v = video, t = miniatura. */
export function tokenMux(p: { keyId: string; llavePrivadaBase64: string; playbackId: string; aud: 'v' | 't'; segundos?: number; ahora?: number }): string {
  const exp = Math.floor((p.ahora ?? Date.now()) / 1000) + (p.segundos ?? 3600);
  const cabecera = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: p.keyId }));
  const cuerpo = base64url(JSON.stringify({ sub: p.playbackId, aud: p.aud, exp, kid: p.keyId }));
  const pem = Buffer.from(p.llavePrivadaBase64, 'base64').toString('utf8');
  const firma = createSign('RSA-SHA256').update(`${cabecera}.${cuerpo}`).sign(pem);
  return `${cabecera}.${cuerpo}.${base64url(firma)}`;
}

interface AssetMux {
  id: string;
  status: string;
  duration?: number;
  passthrough?: string;
  upload_id?: string;
  playback_ids?: { id: string; policy: string }[];
}

/**
 * Videos con Mux (pruebas de las fases y portafolio). Supabase solo guarda los ids de Mux.
 * - La subida va directa del navegador a Mux con una URL que da la API.
 * - Mux avisa por webhook cuando el video está listo (y la API también consulta, por si el webhook no llega).
 * - Los videos de pruebas son privados: se ven con un token firmado que dura una hora.
 * Si Mux no está configurado (MUX_*), las pruebas solo aceptan archivos y enlaces.
 */
@Injectable()
export class VideosService {
  private readonly log = new Logger('Videos');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONFIGURACION) private readonly config: Configuracion,
  ) {}

  get encendido(): boolean {
    return Boolean(this.config.servicios.mux);
  }

  private async mux<T>(ruta: string, opciones: { metodo?: string; cuerpo?: unknown } = {}): Promise<T> {
    const m = this.config.servicios.mux;
    if (!m) throw new ServiceUnavailableException('Los videos no están disponibles en este servidor');
    const r = await fetch(`${MUX}${ruta}`, {
      method: opciones.metodo ?? (opciones.cuerpo ? 'POST' : 'GET'),
      headers: { Authorization: `Basic ${Buffer.from(`${m.tokenId}:${m.tokenSecret}`).toString('base64')}`, 'Content-Type': 'application/json' },
      body: opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined,
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (!r?.ok) {
      this.log.warn(`Mux respondió ${r?.status ?? 'sin respuesta'} en ${ruta}`);
      throw new ServiceUnavailableException('El servicio de videos no respondió; intenta de nuevo');
    }
    return ((await r.json()) as { data: T }).data;
  }

  /** URL para subir un video directo a Mux desde el navegador. */
  async crearSubida(yo: Usuario, uso: 'prueba' | 'portafolio') {
    const id = randomUUID();
    const politica = uso === 'prueba' ? 'signed' : 'public';
    const subida = await this.mux<{ id: string; url: string }>('/video/v1/uploads', {
      cuerpo: {
        cors_origin: this.config.urlPublica,
        timeout: 3600,
        new_asset_settings: { playback_policy: [politica], video_quality: 'basic', passthrough: id },
      },
    });
    await this.prisma.video.create({ data: { id, usuario_id: yo.id, uso, mux_upload_id: subida.id, politica } });
    return { video_id: id, url_subida: subida.url };
  }

  /** Consulta a Mux cómo va un video (por si el webhook no llegó, por ejemplo en desarrollo). */
  async actualizar(video: Video): Promise<Video> {
    if (video.estado === 'listo' || video.estado === 'error' || !this.encendido) return video;
    let assetId = video.mux_asset_id;
    if (!assetId) {
      const subida = await this.mux<{ asset_id?: string; status: string }>(`/video/v1/uploads/${encodeURIComponent(video.mux_upload_id)}`);
      if (['errored', 'cancelled', 'timed_out'].includes(subida.status)) {
        return this.prisma.video.update({ where: { id: video.id }, data: { estado: 'error' } });
      }
      assetId = subida.asset_id ?? null;
      if (!assetId) return video;
    }
    return this.aplicarAsset(await this.mux<AssetMux>(`/video/v1/assets/${encodeURIComponent(assetId)}`), video);
  }

  private async aplicarAsset(asset: AssetMux, video?: Video): Promise<Video> {
    const fila = video ?? (await this.prisma.video.findFirst({ where: { OR: [{ id: asset.passthrough ?? '' }, { mux_asset_id: asset.id }, { mux_upload_id: asset.upload_id ?? '' }] } }));
    if (!fila) throw new NotFoundException('No existe ese video');
    const reglas = reglasDe(this.config.stellar.red).archivos;
    const maximo = fila.uso === 'prueba' ? reglas.videoPruebaMaxSeg : reglas.videoPortafolioMaxSeg;
    let estado = asset.status === 'ready' ? 'listo' : asset.status === 'errored' ? 'error' : 'procesando';
    if (estado === 'listo' && (asset.duration ?? 0) > maximo) estado = 'error';
    return this.prisma.video.update({
      where: { id: fila.id },
      data: {
        mux_asset_id: asset.id,
        playback_id: asset.playback_ids?.[0]?.id ?? fila.playback_id,
        duracion_seg: asset.duration ?? null,
        estado,
      },
    });
  }

  async webhook(cuerpo: Buffer | undefined, firma: string | undefined) {
    const m = this.config.servicios.mux;
    if (!m || !cuerpo) throw new ServiceUnavailableException('Videos apagados');
    if (!firmaMuxValida(m.webhookSecret, cuerpo, firma)) throw new UnauthorizedException('Firma inválida');
    const evento = JSON.parse(cuerpo.toString('utf8')) as { type: string; data: AssetMux };
    if (evento.type.startsWith('video.asset.')) {
      try {
        await this.aplicarAsset(evento.data);
      } catch {
        // Un video que no es de Cryptoville: se ignora.
      }
    }
    return { ok: true };
  }

  /** Tokens para ver un video privado (los da PagosService, que sabe quién puede ver cada prueba). */
  tokens(video: Video): { playback_id: string; video: string | null; miniatura: string | null } | null {
    if (!video.playback_id) return null;
    const m = this.config.servicios.mux;
    if (video.politica === 'public' || !m) return { playback_id: video.playback_id, video: null, miniatura: null };
    const base = { keyId: m.signingKeyId, llavePrivadaBase64: m.signingKeyPrivada, playbackId: video.playback_id };
    return { playback_id: video.playback_id, video: tokenMux({ ...base, aud: 'v' }), miniatura: tokenMux({ ...base, aud: 't' }) };
  }
}

@Controller('videos')
export class VideosController {
  constructor(
    private readonly videos: VideosService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('subida')
  @UseGuards(SesionGuard)
  @Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 20, ttl: 60_000 } })
  async subida(@UsuarioActual() yo: Usuario, @Body() dto: SubidaDto) {
    return this.videos.crearSubida(yo, dto.uso);
  }

  /** Estado de un video propio (subiendo, procesando, listo o error). */
  @Get(':id')
  @UseGuards(SesionGuard)
  async estado(@UsuarioActual() yo: Usuario, @Param('id', ParseUUIDPipe) id: string) {
    const video = await this.prisma.video.findUnique({ where: { id } });
    if (!video) throw new NotFoundException('No existe ese video');
    if (video.usuario_id !== yo.id) throw new ForbiddenException('Ese video no es tuyo');
    const actual = await this.videos.actualizar(video);
    return serializar({ id: actual.id, estado: actual.estado, duracion_seg: actual.duracion_seg, playback_id: actual.politica === 'public' ? actual.playback_id : null });
  }

  @Post('webhook')
  @HttpCode(200)
  @SkipThrottle()
  async webhook(@Req() req: RawBodyRequest<Request>) {
    if (!req.rawBody) throw new BadRequestException('Cuerpo vacío');
    return this.videos.webhook(req.rawBody, req.header('mux-signature') ?? undefined);
  }
}

@Global()
@Module({ controllers: [VideosController], providers: [VideosService], exports: [VideosService] })
export class VideosModule {}
