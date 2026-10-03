import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { createHash } from 'node:crypto';

/**
 * Verificación de mensajes firmados con una wallet de Stellar (SEP-53), sin conectarse a la red.
 * firma = ed25519( sha256("Stellar Signed Message:\n" + mensaje) )
 * Las wallets devuelven la firma en base64 (algunas en hex): se aceptan las dos.
 */
const PREFIJO = 'Stellar Signed Message:\n';

export function hashMensajeSep53(mensaje: string): Buffer {
  return createHash('sha256')
    .update(Buffer.concat([Buffer.from(PREFIJO, 'utf8'), Buffer.from(mensaje, 'utf8')]))
    .digest();
}

export function esDireccionValida(direccion: string): boolean {
  return StrKey.isValidEd25519PublicKey(direccion);
}

function decodificarFirma(firma: string): Buffer | null {
  const limpia = firma.trim();
  if (/^[0-9a-f]{128}$/i.test(limpia)) return Buffer.from(limpia, 'hex');
  const b64 = Buffer.from(limpia, 'base64');
  return b64.length === 64 ? b64 : null;
}

export function verificarFirmaSep53(direccion: string, mensaje: string, firma: string): boolean {
  if (!esDireccionValida(direccion)) return false;
  const bytes = decodificarFirma(firma);
  if (!bytes) return false;
  try {
    return Keypair.fromPublicKey(direccion).verify(hashMensajeSep53(mensaje), bytes);
  } catch {
    return false;
  }
}

/** Firma un mensaje como lo haría una wallet (lo usan el seed y las pruebas). */
export function firmarMensajeSep53(par: Keypair, mensaje: string): string {
  return Buffer.from(par.sign(hashMensajeSep53(mensaje))).toString('base64');
}
