// Firma SEP-53 en el navegador con una llave secreta de TESTNET (solo en desarrollo).
// Sirve para probar la app con las wallets de ejemplo (.seed-keys.json) sin instalar Freighter.
// En producción la firma la hace siempre la wallet del usuario (ver wallet.ts).
import * as ed from '@noble/ed25519';
import { sha256 } from '@noble/hashes/sha2.js';

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const VERSION_PUBLICA = 6 << 3; // "G…"
const VERSION_SECRETA = 18 << 3; // "S…"

function base32Decodificar(texto: string): Uint8Array {
  let bits = 0;
  let valor = 0;
  const salida: number[] = [];
  for (const c of texto) {
    const i = ALFABETO.indexOf(c);
    if (i < 0) throw new Error('La llave tiene caracteres inválidos');
    valor = (valor << 5) | i;
    bits += 5;
    if (bits >= 8) {
      salida.push((valor >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(salida);
}

function base32Codificar(bytes: Uint8Array): string {
  let bits = 0;
  let valor = 0;
  let salida = '';
  for (const b of bytes) {
    valor = (valor << 8) | b;
    bits += 8;
    while (bits >= 5) {
      salida += ALFABETO[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) salida += ALFABETO[(valor << (5 - bits)) & 31];
  return salida;
}

function crc16(bytes: Uint8Array): number {
  let crc = 0;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

function decodificarStrKey(version: number, texto: string): Uint8Array {
  const bytes = base32Decodificar(texto.trim());
  if (bytes.length !== 35 || bytes[0] !== version) throw new Error('La llave no tiene el formato esperado');
  const datos = bytes.slice(0, 33);
  const suma = bytes[33] | (bytes[34] << 8);
  if (crc16(datos) !== suma) throw new Error('La llave tiene un error (checksum)');
  return datos.slice(1);
}

export function codificarDireccion(publica: Uint8Array): string {
  const datos = new Uint8Array(33);
  datos[0] = VERSION_PUBLICA;
  datos.set(publica, 1);
  const suma = crc16(datos);
  const completo = new Uint8Array(35);
  completo.set(datos);
  completo[33] = suma & 0xff;
  completo[34] = suma >> 8;
  return base32Codificar(completo);
}

/** Hash que se firma en SEP-53: sha256("Stellar Signed Message:\n" + mensaje). */
export function hashSep53(mensaje: string): Uint8Array {
  const prefijo = new TextEncoder().encode('Stellar Signed Message:\n');
  const cuerpo = new TextEncoder().encode(mensaje);
  const todo = new Uint8Array(prefijo.length + cuerpo.length);
  todo.set(prefijo);
  todo.set(cuerpo, prefijo.length);
  return sha256(todo);
}

function aBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export interface FirmanteLocal {
  direccion: string;
  firmar(mensaje: string): Promise<string>;
}

/** Crea un firmante a partir de una llave secreta S… (solo testnet). */
export async function firmanteDesdeSecreta(secreta: string): Promise<FirmanteLocal> {
  const semilla = decodificarStrKey(VERSION_SECRETA, secreta);
  const publica = await ed.getPublicKeyAsync(semilla);
  return {
    direccion: codificarDireccion(publica),
    firmar: async (mensaje) => aBase64(await ed.signAsync(hashSep53(mensaje), semilla)),
  };
}
