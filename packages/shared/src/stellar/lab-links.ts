// Enlaces a Stellar Lab (https://lab.stellar.org).
//
// El Lab guarda su estado en la URL con un formato propio:
//   ?$=network$id=testnet&label=Testnet&...;&smartContracts$explorer$contractId=C...;;
// - `$` anida objetos, `&` separa campos y `;` cierra un objeto.
// - Dentro de los valores, `/` se escribe `//` y los caracteres especiales se escapan con `/`
//   (por ejemplo `;` -> `/;`). Los espacios van como %20.
// El Lab solo acepta en la URL el contrato y el hash; los argumentos de una función
// NO se pueden precargar, por eso la app los muestra para copiar.

export type RedStellar = 'testnet' | 'mainnet';

export const LAB_URL = 'https://lab.stellar.org';

const REDES: Record<RedStellar, { label: string; horizonUrl: string; rpcUrl: string; passphrase: string }> = {
  testnet: {
    label: 'Testnet',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    passphrase: 'Test SDF Network ; September 2015',
  },
  mainnet: {
    label: 'Mainnet',
    horizonUrl: 'https://horizon.stellar.org',
    rpcUrl: 'https://mainnet.sorobanrpc.com',
    passphrase: 'Public Global Stellar Network ; September 2015',
  },
};

export const PASSPHRASE: Record<RedStellar, string> = {
  testnet: REDES.testnet.passphrase,
  mainnet: REDES.mainnet.passphrase,
};

/** Datos públicos de cada red: nombre, Horizon, RPC por defecto y passphrase. */
export function datosRed(red: RedStellar): { label: string; horizonUrl: string; rpcUrl: string; passphrase: string } {
  return REDES[red];
}

/** ¿A qué red pertenece una passphrase? (para avisar si la wallet está en otra red). */
export function redDePassphrase(passphrase: string): RedStellar | null {
  if (passphrase === REDES.testnet.passphrase) return 'testnet';
  if (passphrase === REDES.mainnet.passphrase) return 'mainnet';
  return null;
}

/** Enlace a stellar.expert (explorador público) para una transacción, un contrato o una cuenta. */
export function enlaceExplorador(tipo: 'tx' | 'contract' | 'account', valor: string, red: RedStellar = 'testnet'): string {
  return `https://stellar.expert/explorer/${red === 'mainnet' ? 'public' : 'testnet'}/${tipo}/${valor}`;
}

/** Escapa un valor con el formato de estado del Lab. */
export function escaparValorLab(valor: string): string {
  return valor
    .replace(/\//g, '//')
    .replace(/[;&=$]/g, (c) => `/${c}`)
    .replace(/ /g, '%20');
}

function estadoRed(red: RedStellar): string {
  const r = REDES[red];
  return (
    `$=network$id=${red}` +
    `&label=${escaparValorLab(r.label)}` +
    `&horizonUrl=${escaparValorLab(r.horizonUrl)}` +
    `&rpcUrl=${escaparValorLab(r.rpcUrl)}` +
    `&passphrase=${escaparValorLab(r.passphrase)};`
  );
}

const CONTRATO = /^C[A-Z2-7]{55}$/;
const HASH = /^[0-9a-f]{64}$/i;

/** Contract Explorer con el contrato ya cargado (pestaña "Invoke contract" para llamar funciones). */
export function enlaceContrato(contractId: string, red: RedStellar = 'testnet'): string {
  if (!CONTRATO.test(contractId)) throw new Error('El ID del contrato debe empezar con C y tener 56 caracteres');
  return `${LAB_URL}/smart-contracts/contract-explorer?${estadoRed(red)}&smartContracts$explorer$contractId=${contractId};;`;
}

/** Transaction Dashboard con el hash ya cargado, para revisar una transacción. */
export function enlaceTransaccion(hash: string, red: RedStellar = 'testnet'): string {
  if (!HASH.test(hash)) throw new Error('El hash debe tener 64 caracteres hexadecimales');
  return `${LAB_URL}/transaction/dashboard?${estadoRed(red)}&txDashboard$transactionHash=${hash.toLowerCase()};;`;
}

/** Páginas del Lab que se usan en las guías. */
export function enlacePagina(
  pagina: 'fondear' | 'crear-cuenta' | 'construir-tx' | 'firmar-tx' | 'desplegar' | 'explorador',
  red: RedStellar = 'testnet',
): string {
  const rutas = {
    fondear: '/account/fund',
    'crear-cuenta': '/account/create',
    'construir-tx': '/transaction/build',
    'firmar-tx': '/transaction/sign',
    desplegar: '/smart-contracts/deploy-contract',
    explorador: '/smart-contracts/contract-explorer',
  } as const;
  return `${LAB_URL}${rutas[pagina]}?${estadoRed(red)};`;
}

export function esHashValido(hash: string): boolean {
  return HASH.test(hash.trim());
}

export function esContratoValido(id: string): boolean {
  return CONTRATO.test(id.trim());
}
