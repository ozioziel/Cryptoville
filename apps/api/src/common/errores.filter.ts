import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../generated/prisma/client';

/**
 * Mensajes para las reglas (CHECK) de la base que una persona puede romper escribiendo algo.
 * La API valida casi todo antes, pero si algo se escapa, la persona ve esto y no «error inesperado».
 */
const MENSAJE_REGLA: Record<string, string> = {
  servicios_precio_check: 'El precio tiene que ser mayor que 0',
  servicios_dias_check: 'Los días de entrega van de 1 a 90',
  busquedas_presupuesto_check: 'El presupuesto tiene que ser mayor que 0',
  busquedas_titulo_check: 'El título va de 3 a 60 letras',
  busquedas_descripcion_check: 'La descripción va de 10 a 1000 letras',
  propuestas_monto_check: 'El monto tiene que ser mayor que 0',
  propuestas_dias_check: 'Los días de entrega van de 1 a 90',
  propuestas_mensaje_check: 'El mensaje va de 10 a 1000 letras',
  propuestas_proyectos_check: 'Puedes adjuntar hasta 5 proyectos',
  pedidos_monto_check: 'El monto tiene que ser mayor que 0',
  pedidos_partes_check: 'No puedes contratar tu propio servicio',
  fases_monto_check: 'Cada fase tiene que tener un monto mayor que 0',
  fases_porcentajes_check: 'Los porcentajes de cada fase van de 1 a 100',
  resenas_calificacion_check: 'La calificación va de 1 a 5 estrellas',
  usuarios_nombre_check: 'El nombre va de 2 a 40 letras',
  comentarios_texto_check: 'El comentario va de 5 a 2000 letras',
  mensajes_cercania_texto_check: 'El mensaje va de 1 a 280 letras',
  proyectos_titulo_check: 'El título va de 3 a 80 letras',
  proyectos_descripcion_check: 'La descripción va de 10 a 2000 letras',
  experiencias_fechas_check: 'La fecha de fin no puede ser antes de la de inicio',
  preferencias_avisos_correo_check: 'Ese correo no parece válido',
  pruebas_url_check: 'El enlace tiene que empezar con https://',
  bloqueos_distintos_check: 'No puedes bloquearte a ti mismo',
  mensajes_cercania_distintos_check: 'No puedes escribirte a ti mismo',
};

/** Código de Postgres (23514, 23503…) y regla, cuando Prisma los trae por el adaptador (Prisma 7). */
function errorDePostgres(error: Prisma.PrismaClientKnownRequestError): { codigo?: string; regla?: string } {
  const causa = (error.meta as { driverAdapterError?: { cause?: { code?: string; constraint?: string; message?: string } } } | undefined)
    ?.driverAdapterError?.cause;
  const texto = causa?.message ?? error.message;
  const codigo = causa?.code ?? /Code: `(\d{5})`/.exec(error.message)?.[1];
  const regla = causa?.constraint ?? /constraint "([a-z0-9_]+)"/.exec(texto)?.[1];
  return { codigo, regla };
}

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
      const pg = errorDePostgres(error);
      if (error.code === 'P2002' || pg.codigo === '23505') {
        estado = HttpStatus.CONFLICT;
        mensaje = 'Ese dato ya existe (por ejemplo, un hash que ya se usó)';
      } else if (error.code === 'P2025') {
        estado = HttpStatus.NOT_FOUND;
        mensaje = 'No se encontró el registro';
      } else if (pg.codigo === '23514') {
        // Una regla (CHECK) de la base: es un dato inválido, no un error del servidor.
        estado = HttpStatus.BAD_REQUEST;
        mensaje = (pg.regla && MENSAJE_REGLA[pg.regla]) ?? 'Algún dato no es válido. Revisa lo que escribiste.';
        this.log.warn(`Regla de la base rechazó un dato: ${pg.regla ?? 'desconocida'}`);
      } else if (error.code === 'P2003' || pg.codigo === '23503') {
        estado = HttpStatus.BAD_REQUEST;
        mensaje = 'Uno de los datos apunta a algo que ya no existe';
      } else if (error.code === 'P2011' || pg.codigo === '23502') {
        estado = HttpStatus.BAD_REQUEST;
        mensaje = 'Falta un dato obligatorio';
      } else {
        this.log.error(error);
      }
    } else {
      this.log.error(error);
    }

    res.status(estado).json({ estado, mensaje });
  }
}
