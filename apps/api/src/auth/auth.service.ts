import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { AVATARES, mensajeInicioSesion, VIGENCIA_DESAFIO_SEG } from '@cryptoville/shared';
import { randomBytes } from 'node:crypto';
import { CONFIGURACION, type Configuracion } from '../config/configuracion';
import type { Usuario } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import { contrasenaDeWallet, correoDeWallet } from './credenciales';
import { esDireccionValida, verificarFirmaSep53 } from './firma-stellar';

export interface SesionEmitida {
  access_token: string;
  refresh_token: string;
  expires_at: number | null;
  usuario: Usuario;
}

/**
 * Inicio de sesión con wallet:
 * 1. `crearDesafio`: la API arma un mensaje con un código de un solo uso.
 * 2. El usuario lo firma con su wallet (SEP-53).
 * 3. `verificar`: la API comprueba la firma sin conectarse a Stellar y obtiene una sesión
 *    de Supabase Auth para esa wallet. Así RLS y Realtime reconocen al usuario igual en
 *    local y en la nube, sin firmar JWT propios.
 *
 * Cada wallet tiene una cuenta en Supabase Auth con un correo interno y una contraseña
 * derivada (HMAC con AUTH_PASSWORD_SECRET) que nunca sale del servidor.
 */
@Injectable()
export class AuthService {
  private readonly log = new Logger('Auth');

  constructor(
    @Inject(CONFIGURACION) private readonly config: Configuracion,
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
  ) {}

  async crearDesafio(direccion: string): Promise<{ nonce: string; mensaje: string; expira_en: string }> {
    if (!esDireccionValida(direccion)) throw new BadRequestException('La dirección de la wallet no es válida');
    const nonce = randomBytes(16).toString('hex');
    const expira = new Date(Date.now() + VIGENCIA_DESAFIO_SEG * 1000);
    const mensaje = mensajeInicioSesion({
      direccion,
      nonce,
      dominio: this.config.publicHost,
      emitido: new Date().toISOString(),
    });
    await this.prisma.desafioLogin.create({ data: { nonce, direccion, mensaje, expira_en: expira } });
    // Limpieza de desafíos viejos.
    await this.prisma.desafioLogin.deleteMany({ where: { expira_en: { lt: new Date(Date.now() - 3_600_000) } } });
    return { nonce, mensaje, expira_en: expira.toISOString() };
  }

  async verificar(direccion: string, nonce: string, firma: string): Promise<SesionEmitida> {
    const desafio = await this.prisma.desafioLogin.findUnique({ where: { nonce } });
    if (!desafio || desafio.direccion !== direccion || desafio.expira_en < new Date()) {
      throw new UnauthorizedException('El código de inicio de sesión no es válido o ya venció; vuelve a intentarlo');
    }
    // Se marca como usado de forma atómica: un desafío sirve una sola vez.
    const marcado = await this.prisma.desafioLogin.updateMany({
      where: { nonce, usado: false },
      data: { usado: true },
    });
    if (marcado.count !== 1) throw new UnauthorizedException('Ese código ya se usó; vuelve a intentarlo');

    if (!verificarFirmaSep53(direccion, desafio.mensaje, firma)) {
      throw new UnauthorizedException('La firma no corresponde a esa wallet');
    }
    return this.emitirSesion(direccion);
  }

  /** Obtiene (o crea) la cuenta de Supabase Auth de la wallet y devuelve una sesión. */
  async emitirSesion(direccion: string): Promise<SesionEmitida> {
    const credenciales = { email: this.correoDe(direccion), password: this.contrasenaDe(direccion) };
    const cliente = this.supabase.publico();

    let inicio = await cliente.auth.signInWithPassword(credenciales);
    if (inicio.error) {
      const creado = await this.supabase.admin.auth.admin.createUser({
        ...credenciales,
        email_confirm: true,
        app_metadata: { direccion },
      });
      if (creado.error) {
        this.log.error(`No se pudo crear la cuenta de ${direccion}: ${creado.error.message}`);
        throw new InternalServerErrorException('No se pudo crear tu cuenta, intenta de nuevo');
      }
      inicio = await cliente.auth.signInWithPassword(credenciales);
    }
    if (inicio.error || !inicio.data.session) {
      this.log.error(`No se pudo iniciar sesión para ${direccion}: ${inicio.error?.message}`);
      throw new InternalServerErrorException('No se pudo iniciar tu sesión, intenta de nuevo');
    }

    const { session, user } = inicio.data;
    const usuario = await this.prisma.usuario.upsert({
      where: { id: user.id },
      update: {},
      create: { id: user.id, direccion, nombre: `Vecino ${direccion.slice(-4)}`, avatar: avatarPorDefecto(direccion) },
    });
    return {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at ?? null,
      usuario,
    };
  }

  correoDe(direccion: string): string {
    return correoDeWallet(direccion, this.config.auth.dominioCorreo);
  }

  private contrasenaDe(direccion: string): string {
    return contrasenaDeWallet(direccion, this.config.auth.secretoContrasenas);
  }
}

function avatarPorDefecto(direccion: string): number {
  let suma = 0;
  for (const c of direccion) suma = (suma + c.charCodeAt(0)) % 997;
  return AVATARES[suma % AVATARES.length];
}
