// Mensaje que el usuario firma con su wallet para iniciar sesión (SEP-53).
// La API lo arma y luego verifica la firma; la web solo lo muestra y lo firma.

export const VIGENCIA_DESAFIO_SEG = 5 * 60;

/** Cómo entró la persona: con su wallet, con su correo (Pollar) o con una llave de prueba (solo desarrollo). */
export type MetodoEntrada = 'wallet' | 'pollar' | 'llave-prueba';

export const METODOS_ENTRADA: readonly MetodoEntrada[] = ['wallet', 'pollar', 'llave-prueba'];

/**
 * La red va en el mensaje: una firma hecha para testnet no sirve para entrar en mainnet (y al revés),
 * aunque la wallet sea la misma.
 */
export function mensajeInicioSesion(p: { direccion: string; nonce: string; dominio: string; emitido: string; red?: string }): string {
  return [
    'Cryptoville: iniciar sesión',
    `Dominio: ${p.dominio}`,
    ...(p.red ? [`Red: ${p.red}`] : []),
    `Wallet: ${p.direccion}`,
    `Código: ${p.nonce}`,
    `Emitido: ${p.emitido}`,
    'Firmar este mensaje no mueve dinero ni autoriza pagos.',
  ].join('\n');
}

/** Mensaje para sumar otra wallet a la cuenta (lo firma la wallet nueva). */
export function mensajeVincularWallet(p: { direccion: string; cuenta: string; nonce: string; dominio: string; emitido: string; red: string }): string {
  return [
    'Cryptoville: sumar esta wallet a mi cuenta',
    `Dominio: ${p.dominio}`,
    `Red: ${p.red}`,
    `Wallet nueva: ${p.direccion}`,
    `Cuenta: ${p.cuenta}`,
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
