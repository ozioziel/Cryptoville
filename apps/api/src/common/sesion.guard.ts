import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import type { SolicitudAutenticada } from './usuario-actual';

export const SOLO_ARBITRO = 'solo_arbitro';
/** Marca un endpoint como exclusivo del árbitro. */
export const SoloArbitro = () => SetMetadata(SOLO_ARBITRO, true);

export const PERMITIR_SUSPENDIDO = 'permitir_suspendido';
/** Endpoints que una cuenta suspendida sí puede usar (ver su perfil, escribirle al equipo). */
export const PermitirSuspendido = () => SetMetadata(PERMITIR_SUSPENDIDO, true);

/**
 * Exige una sesión de Supabase válida (Authorization: Bearer <access_token>).
 * La sesión la emite Supabase Auth cuando la API verifica la firma de la wallet.
 */
@Injectable()
export class SesionGuard implements CanActivate {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<SolicitudAutenticada>();
    const token = /^Bearer (.+)$/i.exec(req.headers.authorization ?? '')?.[1];
    if (!token) throw new UnauthorizedException('Inicia sesión con tu wallet');

    const { data, error } = await this.supabase.admin.auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException('La sesión no es válida o venció');

    const usuario = await this.prisma.usuario.findUnique({ where: { id: data.user.id } });
    if (!usuario) throw new UnauthorizedException('Tu cuenta no existe en Cryptoville');

    const permitirSuspendido = this.reflector.getAllAndOverride<boolean>(PERMITIR_SUSPENDIDO, [ctx.getHandler(), ctx.getClass()]);
    if (usuario.suspendido && !permitirSuspendido) {
      throw new ForbiddenException('Tu cuenta está suspendida por un reporte. Escríbenos desde «Enviar comentarios».');
    }

    const soloArbitro = this.reflector.getAllAndOverride<boolean>(SOLO_ARBITRO, [ctx.getHandler(), ctx.getClass()]);
    if (soloArbitro && usuario.rol !== 'arbitro') throw new ForbiddenException('Solo el árbitro puede hacer esto');

    req.usuario = usuario;
    return true;
  }
}
