import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Usuario } from '../generated/prisma/client';

export type SolicitudAutenticada = Request & { usuario: Usuario };

/** Inyecta el usuario de la sesión (lo pone SesionGuard). */
export const UsuarioActual = createParamDecorator((_: unknown, ctx: ExecutionContext): Usuario => {
  return ctx.switchToHttp().getRequest<SolicitudAutenticada>().usuario;
});
