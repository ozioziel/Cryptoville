import { formatoUsdc } from '@cryptoville/shared';
import { Prisma } from '../generated/prisma/client';

/**
 * Convierte lo que devuelve Prisma a JSON plano:
 * BigInt -> number (los números de pedido caben en 2^53), Decimal -> texto USDC, Date -> ISO.
 */
export function serializar<T>(valor: T): unknown {
  if (valor === null || valor === undefined) return valor;
  if (typeof valor === 'bigint') return Number(valor);
  if (valor instanceof Date) return valor.toISOString();
  if (Array.isArray(valor)) return valor.map((v) => serializar(v));
  if (typeof valor === 'object') {
    if (Prisma.Decimal.isDecimal(valor)) return formatoUsdc((valor as Prisma.Decimal).toFixed());
    const obj = valor as Record<string, unknown>;
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, serializar(v)]));
  }
  return valor;
}
