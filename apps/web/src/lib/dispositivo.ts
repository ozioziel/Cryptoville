// Qué tipo de dispositivo usa la persona (para mostrar los controles y las wallets que funcionan ahí).

/** Pantalla táctil (celular o tablet): los controles son botones y el joystick, no teclas. */
export function esTactil(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
}

/**
 * Celular: pantalla táctil y chica. Ahí no hay extensiones de wallet (Freighter, xBull…):
 * se firma con la app de la wallet por WalletConnect o con una wallet web.
 */
export function esCelular(): boolean {
  return esTactil() && typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 600;
}
