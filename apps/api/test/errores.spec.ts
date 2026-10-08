import type { ArgumentsHost } from '@nestjs/common';
import { ErroresFilter } from '../src/common/errores.filter';
import { Prisma } from '../src/generated/prisma/client';

/** Lo que devuelve Prisma 7 (con el adaptador de Postgres) cuando la base rechaza un dato. */
function errorDeLaBase(codigo: string, mensaje: string) {
  return new Prisma.PrismaClientKnownRequestError('Database error', {
    code: 'P2039',
    clientVersion: 'prueba',
    meta: { driverAdapterError: { cause: { code: codigo, message: mensaje } } },
  });
}

function responder(error: unknown) {
  const respuesta = { estado: 0, cuerpo: null as unknown };
  const res = {
    status(estado: number) {
      respuesta.estado = estado;
      return this;
    },
    json(cuerpo: unknown) {
      respuesta.cuerpo = cuerpo;
    },
  };
  const host = { switchToHttp: () => ({ getResponse: () => res }) } as unknown as ArgumentsHost;
  new ErroresFilter().catch(error, host);
  return respuesta;
}

describe('errores de la base', () => {
  it('una regla (CHECK) de la base es un 400 con un mensaje claro, no un error inesperado', () => {
    const r = responder(errorDeLaBase('23514', 'new row for relation "servicios" violates check constraint "servicios_precio_check"'));
    expect(r.estado).toBe(400);
    expect(r.cuerpo).toEqual({ estado: 400, mensaje: 'El precio tiene que ser mayor que 0' });
  });

  it('una regla sin mensaje propio igual es un 400', () => {
    const r = responder(errorDeLaBase('23514', 'violates check constraint "otra_regla_check"'));
    expect(r.estado).toBe(400);
    expect((r.cuerpo as { mensaje: string }).mensaje).toMatch(/no es válido/);
  });

  it('un dato repetido es un 409', () => {
    expect(responder(errorDeLaBase('23505', 'duplicate key value violates unique constraint "x_key"')).estado).toBe(409);
  });

  it('lo demás sigue siendo un 500 sin detalles', () => {
    const r = responder(new Error('algo interno con datos sensibles'));
    expect(r).toEqual({ estado: 500, cuerpo: { estado: 500, mensaje: 'Ocurrió un error inesperado' } });
  });
});
