// Conexión con wallets de Stellar mediante Stellar Wallets Kit.
// - Firma el mensaje para iniciar sesión (SEP-53) y las transacciones que arma WorkVille.
// - Si el servidor tiene WALLETCONNECT_PROJECT_ID, suma la opción WalletConnect: aparece un QR
//   y la persona firma con la wallet de su celular (LOBSTR, Freighter Mobile…).
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { defaultModules } from '@creit.tech/stellar-wallets-kit/modules/utils';
import { Networks, type ModuleInterface } from '@creit.tech/stellar-wallets-kit/types';
import { PASSPHRASE, datosRed, redDePassphrase, type RedStellar } from '@cryptoville/shared';

const CLAVE_MODULO = 'cryptoville-wallet-modulo';
let iniciado: Promise<void> | null = null;

/** El usuario cerró el selector o rechazó la firma: no es un error que haya que mostrar. */
export class CanceladoPorUsuario extends Error {
  constructor() {
    super('Cancelado');
  }
}

/** Los errores del kit son objetos { code, message }: se pasan a un Error en español. */
function traducirError(e: unknown): Error {
  if (e instanceof CanceladoPorUsuario) return e;
  const mensaje = typeof e === 'object' && e !== null && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  if (/clos|cancel|reject|declin|denied|abort/i.test(mensaje)) return new CanceladoPorUsuario();
  if (/not (installed|available)|no wallet/i.test(mensaje)) return new Error('No encontramos esa wallet en tu navegador. Instálala o elige otra.');
  if (/sign.*message|not supported|unsupported/i.test(mensaje)) {
    return new Error('Tu wallet no permite firmar mensajes. Prueba con Freighter o xBull.');
  }
  return new Error(`La wallet respondió: ${mensaje}`);
}

function guardarModulo(): void {
  try {
    localStorage.setItem(CLAVE_MODULO, StellarWalletsKit.selectedModule.productId);
  } catch {
    // Sin almacenamiento local: se volverá a preguntar qué wallet usar.
  }
}

/** Inicia el kit (una sola vez). WalletConnect se carga solo si hay un project id. */
function iniciar(red: RedStellar, walletConnectId?: string | null): Promise<void> {
  iniciado ??= (async () => {
    const modulos: ModuleInterface[] = defaultModules();
    if (walletConnectId) {
      try {
        const { WalletConnectModule, WalletConnectTargetChain } = await import('@creit.tech/stellar-wallets-kit/modules/wallet-connect');
        modulos.push(
          new WalletConnectModule({
            projectId: walletConnectId,
            metadata: {
              name: 'WorkVille',
              description: 'Un pueblo de servicios con pago en garantía en Stellar',
              url: location.origin,
              icons: [`${location.origin}/assets/brand/workville-logo-cropped.png`],
            },
            allowedChains: [red === 'mainnet' ? WalletConnectTargetChain.PUBLIC : WalletConnectTargetChain.TESTNET],
          }),
        );
      } catch {
        // Si WalletConnect no carga, siguen las demás wallets.
      }
    }
    StellarWalletsKit.init({
      modules: modulos,
      network: red === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET,
      authModal: { showInstallLabel: true, hideUnsupportedWallets: false },
    });
    // Después de recargar la página, se vuelve a usar la última wallet elegida.
    try {
      const guardado = localStorage.getItem(CLAVE_MODULO);
      if (guardado) StellarWalletsKit.setWallet(guardado);
    } catch {
      // No pasa nada: se preguntará al firmar.
    }
  })();
  return iniciado;
}

/** Abre el selector de wallets (con el QR de WalletConnect si está encendido) y devuelve la dirección elegida. */
export async function conectarWallet(red: RedStellar, walletConnectId?: string | null): Promise<string> {
  await iniciar(red, walletConnectId);
  try {
    const { address } = await StellarWalletsKit.authModal();
    guardarModulo();
    return address;
  } catch (e) {
    throw traducirError(e);
  }
}

/** Avisa si la wallet está en otra red (por ejemplo, en mainnet cuando WorkVille está en testnet). */
export async function revisarRedDeLaWallet(red: RedStellar): Promise<void> {
  let passphrase: string | null = null;
  try {
    passphrase = (await StellarWalletsKit.getNetwork()).networkPassphrase;
  } catch {
    return; // Algunas wallets no dicen su red: se sigue y la red rechazará la firma si no coincide.
  }
  const suRed = redDePassphrase(passphrase);
  if (suRed && suRed !== red) {
    throw new Error(`Tu wallet está en ${datosRed(suRed).label}. Cámbiala a ${datosRed(red).label} y vuelve a intentar.`);
  }
}

/** Pide a la wallet que firme el mensaje (SEP-53). Devuelve la firma en base64. */
export async function firmarConWallet(mensaje: string, direccion: string, red: RedStellar, walletConnectId?: string | null): Promise<string> {
  await iniciar(red, walletConnectId);
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

/** Pide a la wallet que firme una transacción armada por WorkVille. Devuelve el XDR firmado. */
export async function firmarTransaccionConWallet(xdr: string, direccion: string, red: RedStellar, walletConnectId?: string | null): Promise<string> {
  await iniciar(red, walletConnectId);
  await revisarRedDeLaWallet(red);
  try {
    const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, { address: direccion, networkPassphrase: PASSPHRASE[red] });
    return signedTxXdr;
  } catch (e) {
    throw traducirError(e);
  }
}

/** Dirección de la wallet conectada ahora mismo en el kit (o null). */
export async function direccionConectada(red: RedStellar, walletConnectId?: string | null): Promise<string | null> {
  await iniciar(red, walletConnectId);
  try {
    return (await StellarWalletsKit.getAddress()).address;
  } catch {
    return null;
  }
}

export async function desconectarWallet(): Promise<void> {
  if (!iniciado) return;
  try {
    localStorage.removeItem(CLAVE_MODULO);
  } catch {
    // No pasa nada.
  }
  try {
    await StellarWalletsKit.disconnect();
  } catch {
    // Algunas wallets no soportan desconectar: no pasa nada.
  }
}
