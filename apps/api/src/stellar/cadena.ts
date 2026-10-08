// Funciones puras para leer y armar llamadas a los contratos (sin conexión a la red).
// Las usa StellarService y se prueban sin red en test/cadena.spec.ts.
import { Address, FeeBumpTransaction, TransactionBuilder, nativeToScVal, scValToNative, xdr, type Transaction } from '@stellar/stellar-sdk';

/** Una llamada a un contrato dentro de una transacción. */
export interface Invocacion {
  contrato: string;
  funcion: string;
  /** Argumentos ya convertidos a valores de JS (Address → "G…", u64/i128 → bigint, enum → ["Cliente"]). */
  args: unknown[];
  /** Cuenta que paga la transacción (la que firma la operación). */
  fuente: string;
}

/** Transacción simple a partir de su XDR (si es fee bump, la de adentro). */
export function transaccionDeXdr(xdrBase64: string, passphrase: string): Transaction {
  const tx = TransactionBuilder.fromXDR(xdrBase64, passphrase);
  return tx instanceof FeeBumpTransaction ? tx.innerTransaction : tx;
}

/** Lee la primera operación de la transacción si es una llamada a un contrato. */
export function invocacionDe(tx: Transaction): Invocacion | null {
  const op = tx.operations[0];
  if (!op || op.type !== 'invokeHostFunction' || tx.operations.length !== 1) return null;
  const funcion = op.func;
  if (funcion.type !== 'hostFunctionTypeInvokeContract') return null;
  const llamada = funcion.invokeContract;
  return {
    contrato: Address.fromScAddress(llamada.contractAddress).toString(),
    funcion: llamada.functionName.toString(),
    args: llamada.args.map((a: xdr.ScVal) => scValToNative(a)),
    fuente: op.source ?? tx.source,
  };
}

export function invocacionDeSobre(sobre: xdr.TransactionEnvelope, passphrase: string): Invocacion | null {
  return invocacionDe(transaccionDeXdr(sobre.toXDR('base64'), passphrase));
}

/** Hash de la transacción en hexadecimal (no depende de las firmas). */
export function hashDe(tx: Transaction): string {
  return Buffer.from(tx.hash()).toString('hex');
}

// ---------------------------------------------------------------
// Argumentos para armar llamadas
// ---------------------------------------------------------------

export const arg = {
  direccion: (g: string) => new Address(g).toScVal(),
  u64: (n: bigint | number | string) => nativeToScVal(BigInt(n), { type: 'u64' }),
  u32: (n: number) => nativeToScVal(n, { type: 'u32' }),
  i128: (n: bigint | string) => nativeToScVal(BigInt(n), { type: 'i128' }),
  /** Enum sin datos de Rust (Parte::Cliente, Resultado::Mitad…). */
  variante: (nombre: string) => xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(nombre)]),
  bytes32: (hex: string) => {
    if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('La huella debe tener 64 caracteres hexadecimales');
    return xdr.ScVal.scvBytes(Buffer.from(hex, 'hex'));
  },
  /** Struct de Rust: un mapa con las llaves ordenadas (así lo exige Soroban). */
  estructura: (campos: Record<string, xdr.ScVal>) =>
    xdr.ScVal.scvMap(
      Object.keys(campos)
        .sort()
        .map((k) => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(k), val: campos[k] })),
    ),
  lista: (valores: xdr.ScVal[]) => xdr.ScVal.scvVec(valores),
};

/** Nombre de la variante de un enum leído con scValToNative (["Pagado"] → "Pagado"). */
export function variante(valor: unknown): string | null {
  if (Array.isArray(valor) && typeof valor[0] === 'string') return valor[0];
  if (typeof valor === 'string') return valor;
  return null;
}

/** Código de error del contrato dentro de un mensaje de simulación ("Error(Contract, #7)" → 7). */
export function codigoErrorContrato(mensaje: string): number | null {
  const m = /Error\(Contract, #(\d+)\)/.exec(mensaje);
  return m ? Number(m[1]) : null;
}

/** Compara dos valores leídos de la red (bigint, string o número) sin perder precisión. */
export function mismoValor(a: unknown, b: unknown): boolean {
  if (a === undefined || a === null || b === undefined || b === null) return false;
  try {
    return BigInt(a as string | number | bigint) === BigInt(b as string | number | bigint);
  } catch {
    return String(a) === String(b);
  }
}
