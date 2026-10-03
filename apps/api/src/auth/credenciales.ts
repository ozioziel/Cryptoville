import { createHmac } from 'node:crypto';

/**
 * Credenciales internas de Supabase Auth para una wallet. Las usan AuthService y el seed.
 * La contraseña se deriva con HMAC: nunca se guarda ni sale del servidor.
 */
export function correoDeWallet(direccion: string, dominio: string): string {
  return `${direccion.toLowerCase()}@${dominio}`;
}

export function contrasenaDeWallet(direccion: string, secreto: string): string {
  return createHmac('sha256', secreto).update(direccion).digest('hex');
}
