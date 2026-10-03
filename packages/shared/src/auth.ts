// Mensaje que el usuario firma con su wallet para iniciar sesión (SEP-53).
// La API lo arma y luego verifica la firma; la web solo lo muestra y lo firma.

export const VIGENCIA_DESAFIO_SEG = 5 * 60;

export function mensajeInicioSesion(p: { direccion: string; nonce: string; dominio: string; emitido: string }): string {
  return [
    'Cryptoville: iniciar sesión',
    `Dominio: ${p.dominio}`,
    `Wallet: ${p.direccion}`,
    `Código: ${p.nonce}`,
    `Emitido: ${p.emitido}`,
    'Firmar este mensaje no mueve dinero ni autoriza pagos.',
  ].join('\n');
}

const DIRECCION = /^G[A-Z2-7]{55}$/;

/** Validación de forma de una dirección G… (la API además valida el checksum). */
export function pareceDireccionStellar(direccion: string): boolean {
  return DIRECCION.test(direccion.trim());
}
