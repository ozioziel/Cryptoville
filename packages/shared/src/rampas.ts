// Rampas: pasar de bolivianos a USDC (pagar con el QR del banco) y de USDC a la cuenta del banco.
// Cryptoville nunca recibe ni guarda dinero: lo cambia un proveedor con licencia (en mainnet, Pollar).
//
// ⚠ SIMULADO: en testnet no hay una rampa real para el «USDC de prueba», así que todo lo de RAMPA_SIMULADA
// (tipo de cambio, comisión, bancos, el QR) es de mentira, para poder probar el flujo completo.
// Qué está simulado y qué hay que revisar antes de mainnet: docs/simulaciones.md.

/** Una recarga (entrada) o un retiro (salida). */
export type SentidoRampa = 'entrada' | 'salida';
export type ProveedorRampa = 'simulada' | 'pollar';
export type EstadoRampa = 'esperando_pago' | 'acreditada' | 'esperando_envio' | 'enviada' | 'vencida' | 'fallida';

export const RAMPA_SIMULADA = {
  pais: 'BO',
  moneda: 'BOB',
  /** SIMULADO: bolivianos por dólar (valor de ejemplo, no se actualiza). */
  tipoCambio: 6.96,
  /** SIMULADO: comisión de la rampa, en % del monto en bolivianos. */
  comisionPct: 1,
  /** Minutos que vale el QR de una recarga. */
  minutosVigencia: 15,
  /** Montos permitidos por operación (USDC). */
  minimoUsdc: 1,
  maximoUsdc: 1000,
  /** SIMULADO: bancos de Bolivia para el retiro (la rampa real trae su propia lista). */
  bancos: ['Banco Nacional de Bolivia (BNB)', 'Banco de Crédito de Bolivia (BCP)', 'Banco Unión', 'Banco Mercantil Santa Cruz', 'Banco Económico', 'Banco Ganadero', 'Banco Bisa', 'Banco FIE', 'BancoSol'],
} as const;

export interface CotizacionRampa {
  sentido: SentidoRampa;
  pais: string;
  moneda: string;
  monto_usdc: string;
  tipo_cambio: number;
  /** Comisión de la rampa (en la moneda local). */
  comision_local: string;
  /** Entrada: lo que paga la persona con el banco. Salida: lo que le llega a su cuenta. */
  monto_local: string;
}

const centavos = (n: number) => Math.round(n * 100) / 100;
const dosDecimales = (n: number) => centavos(n).toFixed(2);

/**
 * Cotización de la rampa simulada.
 * - Entrada: la persona paga (USDC × tipo de cambio) + comisión.
 * - Salida: le llega (USDC × tipo de cambio) − comisión.
 */
export function cotizarRampaSimulada(sentido: SentidoRampa, montoUsdc: string | number): CotizacionRampa {
  const usdc = Number(montoUsdc);
  if (!Number.isFinite(usdc) || usdc <= 0) throw new Error('El monto tiene que ser mayor que 0');
  const base = centavos(usdc * RAMPA_SIMULADA.tipoCambio);
  const comision = centavos((base * RAMPA_SIMULADA.comisionPct) / 100);
  return {
    sentido,
    pais: RAMPA_SIMULADA.pais,
    moneda: RAMPA_SIMULADA.moneda,
    monto_usdc: String(montoUsdc),
    tipo_cambio: RAMPA_SIMULADA.tipoCambio,
    comision_local: dosDecimales(comision),
    monto_local: dosDecimales(sentido === 'entrada' ? base + comision : Math.max(0, base - comision)),
  };
}

/** Texto del QR simulado. Empieza con SIMULADO para que ninguna app de banco lo tome por un cobro real. */
export function qrRampaSimulada(referencia: string, montoLocal: string, moneda: string = RAMPA_SIMULADA.moneda): string {
  return `SIMULADO-CRYPTOVILLE|QR-SIMPLE|${moneda}|${montoLocal}|${referencia}`;
}

export const ETIQUETA_ESTADO_RAMPA: Record<EstadoRampa, string> = {
  esperando_pago: 'Esperando tu pago desde el banco',
  acreditada: 'Llegó: ya tienes el USDC',
  esperando_envio: 'Falta que firmes el envío',
  enviada: 'Enviado al banco',
  vencida: 'Venció',
  fallida: 'No se pudo completar',
};
