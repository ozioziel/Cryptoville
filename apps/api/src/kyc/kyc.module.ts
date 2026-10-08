import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Global,
  HttpCode,
  Inject,
  Injectable,
  Logger,
  Module,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
  type RawBodyRequest,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { reglasDe, type UsoKyc } from '@cryptoville/shared';
import type { Request } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AvisosService } from '../avisos/avisos.service';
import { SesionGuard } from '../common/sesion.guard';
import { serializar } from '../common/serializar';
import { UsuarioActual } from '../common/usuario-actual';
import { CONFIGURACION, type Configuracion } from '../config/configuracion';
import type { Usuario } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DIDIT = 'https://verification.didit.me';
/** Webhooks más viejos que esto se rechazan (así no se pueden repetir). */
const TOLERANCIA_SEG = 300;

const NOMBRE_USO: Record<UsoKyc, string> = { abrir_local: 'abrir un local', cobrar: 'cobrar', resenar: 'dejar reseñas' };

/** Lo que importa de la decisión de Didit (el resto no se guarda). */
interface DecisionDidit {
  session_id?: string;
  status?: string;
  vendor_data?: string | null;
  decision?: {
    id_verifications?: { status?: string; document_number?: string | null; document_type?: string | null; issuing_state?: string | null }[];
    id_verification?: { status?: string; document_number?: string | null; document_type?: string | null; issuing_state?: string | null };
  } | null;
}

/** Estado de Didit → estado de la verificación en Cryptoville. */
function estadoDe(status: string | undefined): 'pendiente' | 'en_revision' | 'aprobada' | 'rechazada' {
  switch (status) {
    case 'Approved':
      return 'aprobada';
    case 'Declined':
    case 'Expired':
    case 'Abandoned':
    case 'Kyc Expired':
      return 'rechazada';
    case 'In Review':
    case 'Resubmitted':
      return 'en_revision';
    default:
      return 'pendiente';
  }
}

/** Huella del documento: HMAC de país + tipo + número (normalizado). No se puede revertir para saber el número. */
export function huellaDocumento(secreto: string, d: { pais?: string | null; tipo?: string | null; numero?: string | null }): string | null {
  const numero = (d.numero ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!numero) return null;
  const pais = (d.pais ?? '').toUpperCase().trim();
  const tipo = (d.tipo ?? '').toLowerCase().trim();
  return createHmac('sha256', secreto).update(`${pais}|${tipo}|${numero}`).digest('hex');
}

/** Firma del webhook de Didit: HMAC-SHA256 del cuerpo tal como llegó (X-Signature), con el secreto del webhook. */
export function firmaDiditValida(secreto: string, cuerpo: Buffer, firma: string | undefined, marca: string | undefined, ahora = Date.now()): boolean {
  if (!firma || !marca) return false;
  const segundos = Number(marca);
  if (!Number.isFinite(segundos) || Math.abs(ahora / 1000 - segundos) > TOLERANCIA_SEG) return false;
  const esperada = createHmac('sha256', secreto).update(cuerpo).digest('hex');
  const a = Buffer.from(esperada, 'utf8');
  const b = Buffer.from(firma, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * KYC con Didit (una persona = una cuenta).
 * - La persona se verifica en la página de Didit (documento + selfie); Cryptoville nunca ve esas fotos.
 * - Cuando Didit responde (webhook firmado, o al consultar), se guarda el estado y una HUELLA del documento.
 * - Si la huella ya está en otra cuenta, la verificación queda "duplicada" y la persona no recibe la insignia.
 * Si Didit no está configurado (DIDIT_*), el KYC no se exige y todo sigue como antes.
 */
@Injectable()
export class KycService {
  private readonly log = new Logger('KYC');

  constructor(
    private readonly prisma: PrismaService,
    private readonly avisos: AvisosService,
    @Inject(CONFIGURACION) private readonly config: Configuracion,
  ) {}

  get encendido(): boolean {
    return Boolean(this.config.servicios.didit && this.config.secretoKyc);
  }

  /** Lanza un error si el KYC está encendido, se exige para `uso` y la persona no está verificada. */
  exigir(usuario: Pick<Usuario, 'verificado'>, uso: UsoKyc): void {
    if (!this.encendido) return;
    if (!reglasDe(this.config.stellar.red).kyc.exigidoPara.includes(uso)) return;
    if (!usuario.verificado) {
      throw new ForbiddenException(`Para ${NOMBRE_USO[uso]} primero verifica tu identidad (Perfil → Verificarme). Es una vez y tarda unos minutos.`);
    }
  }

  async crearSesion(yo: Usuario): Promise<{ url: string }> {
    const didit = this.config.servicios.didit;
    if (!didit || !this.encendido) throw new ServiceUnavailableException('La verificación de identidad no está disponible en este servidor');
    if (yo.verificado) throw new BadRequestException('Ya verificaste tu identidad');
    const r = await fetch(`${DIDIT}/v3/session/`, {
      method: 'POST',
      headers: { 'x-api-key': didit.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflow_id: didit.workflowId,
        // Solo el id de la cuenta: así el webhook sabe de quién es la verificación.
        vendor_data: yo.id,
        callback: `${this.config.urlPublica}/?kyc=volver`,
        language: 'es',
      }),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (!r?.ok) {
      this.log.warn(`Didit no creó la sesión (${r?.status ?? 'sin respuesta'})`);
      throw new ServiceUnavailableException('No pudimos abrir la verificación; intenta de nuevo en un momento');
    }
    const sesion = (await r.json()) as { session_id: string; url: string };
    await this.prisma.verificacion.upsert({
      where: { usuario_id: yo.id },
      update: { sesion_id: sesion.session_id, estado: 'pendiente', proveedor: 'didit' },
      create: { usuario_id: yo.id, sesion_id: sesion.session_id, estado: 'pendiente', proveedor: 'didit' },
    });
    return { url: sesion.url };
  }

  /** Consulta la decisión en Didit (por si el webhook no llegó, por ejemplo en desarrollo). */
  async actualizar(yo: Usuario) {
    const didit = this.config.servicios.didit;
    const v = await this.prisma.verificacion.findUnique({ where: { usuario_id: yo.id } });
    if (!didit || !v?.sesion_id) return this.estado(yo);
    const r = await fetch(`${DIDIT}/v3/session/${encodeURIComponent(v.sesion_id)}/decision/`, {
      headers: { 'x-api-key': didit.apiKey },
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (r?.ok) await this.aplicar((await r.json()) as DecisionDidit);
    return this.estado(yo);
  }

  async estado(yo: Pick<Usuario, 'id'>) {
    const v = await this.prisma.verificacion.findUnique({
      where: { usuario_id: yo.id },
      select: { estado: true, verificada_en: true, actualizada_en: true },
    });
    return { encendido: this.encendido, estado: v?.estado ?? null, verificada_en: v?.verificada_en ?? null };
  }

  async webhook(cuerpo: Buffer | undefined, firma: string | undefined, marca: string | undefined) {
    const didit = this.config.servicios.didit;
    if (!didit || !cuerpo) throw new ServiceUnavailableException('KYC apagado');
    if (!firmaDiditValida(didit.webhookSecret, cuerpo, firma, marca)) throw new UnauthorizedException('Firma inválida');
    await this.aplicar(JSON.parse(cuerpo.toString('utf8')) as DecisionDidit);
    return { ok: true };
  }

  /** Aplica una decisión de Didit a la cuenta que figura en `vendor_data`. */
  async aplicar(d: DecisionDidit): Promise<void> {
    const usuarioId = d.vendor_data;
    if (!usuarioId || !/^[0-9a-f-]{36}$/i.test(usuarioId)) return;
    const v = await this.prisma.verificacion.findUnique({ where: { usuario_id: usuarioId } });
    if (!v || (d.session_id && v.sesion_id && d.session_id !== v.sesion_id)) return;
    if (v.estado === 'aprobada') return;

    const estado = estadoDe(d.status);
    if (estado !== 'aprobada') {
      await this.prisma.verificacion.update({ where: { usuario_id: usuarioId }, data: { estado } });
      if (estado === 'rechazada' && v.estado !== 'rechazada') {
        await this.avisos.crear(usuarioId, 'verificacion', 'Tu verificación de identidad no se aprobó. Puedes intentarlo de nuevo desde tu perfil.');
      }
      return;
    }

    const doc = d.decision?.id_verifications?.[0] ?? d.decision?.id_verification;
    const huella = huellaDocumento(this.config.secretoKyc!, { pais: doc?.issuing_state, tipo: doc?.document_type, numero: doc?.document_number });
    if (!huella) {
      await this.prisma.verificacion.update({ where: { usuario_id: usuarioId }, data: { estado: 'en_revision' } });
      return;
    }
    const otra = await this.prisma.verificacion.findUnique({ where: { huella } });
    if (otra && otra.usuario_id !== usuarioId) {
      await this.prisma.verificacion.update({ where: { usuario_id: usuarioId }, data: { estado: 'duplicada' } });
      await this.avisos.crear(
        usuarioId,
        'verificacion',
        'Ese documento ya verificó otra cuenta de Cryptoville. Cada persona puede tener una sola cuenta (con varias wallets).',
      );
      return;
    }
    await this.prisma.$transaction([
      this.prisma.verificacion.update({ where: { usuario_id: usuarioId }, data: { estado: 'aprobada', huella, verificada_en: new Date() } }),
      this.prisma.usuario.update({ where: { id: usuarioId }, data: { verificado: true } }),
    ]);
    await this.avisos.crear(usuarioId, 'verificacion', '¡Listo! Verificaste tu identidad: ya tienes la insignia ✔ junto a tu nombre.');
  }
}

@Controller('kyc')
export class KycController {
  constructor(private readonly kyc: KycService) {}

  @Get('estado')
  @UseGuards(SesionGuard)
  async estado(@UsuarioActual() yo: Usuario) {
    return serializar(await this.kyc.estado(yo));
  }

  /** Abre una sesión de verificación en Didit y devuelve la URL a la que hay que ir. */
  @Post('sesion')
  @HttpCode(200)
  @UseGuards(SesionGuard)
  async sesion(@UsuarioActual() yo: Usuario) {
    return this.kyc.crearSesion(yo);
  }

  /** Consulta el resultado en Didit (al volver de la verificación). */
  @Post('actualizar')
  @HttpCode(200)
  @UseGuards(SesionGuard)
  async actualizar(@UsuarioActual() yo: Usuario) {
    return serializar(await this.kyc.actualizar(yo));
  }

  /** Didit avisa cada cambio de estado. Sin sesión: se comprueba la firma del cuerpo. */
  @Post('webhook')
  @HttpCode(200)
  @SkipThrottle()
  async webhook(@Req() req: RawBodyRequest<Request>) {
    return this.kyc.webhook(req.rawBody, req.header('x-signature') ?? undefined, req.header('x-timestamp') ?? undefined);
  }
}

@Global()
@Module({ controllers: [KycController], providers: [KycService], exports: [KycService] })
export class KycModule {}
