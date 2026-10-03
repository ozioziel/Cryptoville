import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../generated/prisma/client';

/** Respuestas de error uniformes: { estado, mensaje }. Nunca devuelve detalles internos. */
@Catch()
export class ErroresFilter implements ExceptionFilter {
  private readonly log = new Logger('Errores');

  catch(error: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    let estado = HttpStatus.INTERNAL_SERVER_ERROR;
    let mensaje: string | string[] = 'Ocurrió un error inesperado';

    if (error instanceof HttpException) {
      estado = error.getStatus();
      const cuerpo = error.getResponse();
      mensaje =
        typeof cuerpo === 'string'
          ? cuerpo
          : ((cuerpo as { message?: string | string[] }).message ?? error.message);
    } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        estado = HttpStatus.CONFLICT;
        mensaje = 'Ese dato ya existe (por ejemplo, un hash que ya se usó)';
      } else if (error.code === 'P2025') {
        estado = HttpStatus.NOT_FOUND;
        mensaje = 'No se encontró el registro';
      } else {
        this.log.error(error);
      }
    } else {
      this.log.error(error);
    }

    res.status(estado).json({ estado, mensaje });
  }
}
