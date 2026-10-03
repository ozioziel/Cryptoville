// Conexión con wallets de Stellar mediante Stellar Wallets Kit.
// La wallet SOLO se usa para iniciar sesión firmando un mensaje: las transacciones
// del contrato se firman en Stellar Lab.
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { defaultModules } from '@creit.tech/stellar-wallets-kit/modules/utils';
import { Networks } from '@creit.tech/stellar-wallets-kit/types';
import { PASSPHRASE, type RedStellar } from '@cryptoville/shared';

let iniciado = false;

/** El usuario cerró el selector o rechazó la firma: no es un error que haya que mostrar. */
export class CanceladoPorUsuario extends Error {
  constructor() {
    super('Cancelado');
  }
}

/** Los errores del kit son objetos { code, message }: se pasan a un Error en español. */
function traducirError(e: unknown): Error {
  const mensaje = typeof e === 'object' && e !== null && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  if (/clos|cancel|reject|declin|denied|abort/i.test(mensaje)) return new CanceladoPorUsuario();
  if (/not (installed|available)|no wallet/i.test(mensaje)) return new Error('No encontramos esa wallet en tu navegador. Instálala o elige otra.');
  if (/sign.*message|not supported|unsupported/i.test(mensaje)) {
    return new Error('Tu wallet no permite firmar mensajes. Prueba con Freighter o xBull.');
  }
  return new Error(`La wallet respondió: ${mensaje}`);
}

function iniciar(red: RedStellar) {
  if (iniciado) return;
  StellarWalletsKit.init({
    modules: defaultModules(),
    network: red === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET,
    authModal: { showInstallLabel: true, hideUnsupportedWallets: false },
  });
  iniciado = true;
}

/** Abre el selector de wallets y devuelve la dirección elegida. */
export async function conectarWallet(red: RedStellar): Promise<string> {
  iniciar(red);
  try {
    const { address } = await StellarWalletsKit.authModal();
    return address;
  } catch (e) {
    throw traducirError(e);
  }
}

/** Pide a la wallet que firme el mensaje (SEP-53). Devuelve la firma en base64. */
export async function firmarConWallet(mensaje: string, direccion: string, red: RedStellar): Promise<string> {
  iniciar(red);
  try {
    const { signedMessage } = await StellarWalletsKit.signMessage(mensaje, {
      address: direccion,
      networkPassphrase: PASSPHRASE[red],
    });
    return signedMessage;
  } catch (e) {
    throw traducirError(e);
  }
}

export async function desconectarWallet(): Promise<void> {
  if (!iniciado) return;
  try {
    await StellarWalletsKit.disconnect();
  } catch {
    // Algunas wallets no soportan desconectar: no pasa nada.
  }
}
