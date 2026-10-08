// Rampa REAL con Pollar (mainnet): bolivianos → USDC con el QR del banco, desde el navegador y con la sesión
// de Pollar de la persona (Google o correo). Cryptoville no toca el dinero: lo cambia el proveedor de Pollar.
//
// ⚠ SIN PROBAR: Pollar todavía no confirmó que tenga Bolivia (BOB) ni que su forma de pago «QR» sirva con
// QR Simple. Este camino se usa solo en mainnet y solo si `getRampCountries()` trae Bolivia.
// Qué falta revisar: docs/simulaciones.md, sección «Rampa real con Pollar».
import type { PollarClient } from '@pollar/core';

export const PAIS_RAMPA = 'BO';

export interface RecargaPollar {
  txId: string;
  estado: 'pending' | 'processing' | 'completed' | 'failed';
  /** Si la rampa pide verificar la identidad antes (su propio KYC). */
  kycUrl: string | null;
  /** Imagen del QR lista para mostrar (SVG en texto o PNG en base64). */
  qr: { svg: string } | { src: string } | null;
  /** Datos para pagar sin escanear (monto, referencia, cuenta…), ya con su etiqueta. */
  campos: { etiqueta: string; valor: string; copiable: boolean }[];
}

/** ¿La app de Pollar tiene rampa para Bolivia? (necesita la sesión de Pollar). */
export async function hayRampaBolivia(c: PollarClient): Promise<{ moneda: string } | null> {
  const r = await c.getRampCountries();
  const pais = r.countries.find((p) => p.code.toUpperCase() === PAIS_RAMPA);
  return pais?.currency ? { moneda: pais.currency } : null;
}

/** Cotiza y crea la recarga; devuelve el QR para pagar desde el banco. */
export async function crearRecargaPollar(c: PollarClient, montoLocal: number, moneda: string, direccion: string): Promise<RecargaPollar> {
  const { quotes } = await c.getRampsQuote({ country: PAIS_RAMPA, amount: montoLocal, currency: moneda, direction: 'onramp' });
  const cotizacion = quotes.find((q) => q.rail === 'QR') ?? quotes[0];
  if (!cotizacion) throw new Error('El proveedor de cambio no tiene una forma de pago para este monto');
  const r = await c.createOnRamp({ quoteId: cotizacion.quoteId, amount: montoLocal, currency: moneda, country: PAIS_RAMPA, walletAddress: direccion });
  return aRecarga(r);
}

export async function estadoRecargaPollar(c: PollarClient, txId: string): Promise<RecargaPollar> {
  return aRecarga(await c.getRampTransaction(txId));
}

type RespuestaRampa = Awaited<ReturnType<PollarClient['createOnRamp']>>;

function aRecarga(r: RespuestaRampa): RecargaPollar {
  const instrucciones = r.depositInstructions;
  const imagen = instrucciones?.scannable?.image;
  let qr: RecargaPollar['qr'] = null;
  if (imagen) {
    // Los SVG de Pollar se pueden insertar tal cual (inlineSafe); los PNG del proveedor van como imagen.
    if (imagen.mediaType === 'image/svg+xml' && imagen.encoding === 'utf8' && imagen.inlineSafe) qr = { svg: imagen.data };
    else qr = { src: `data:${imagen.mediaType};${imagen.encoding === 'base64' ? 'base64' : 'utf8'},${imagen.data}` };
  }
  return {
    txId: r.txId,
    estado: r.status,
    kycUrl: r.kycUrl ?? null,
    qr,
    campos: (instrucciones?.fields ?? []).map((f) => ({ etiqueta: f.label, valor: f.value, copiable: f.copyable })),
  };
}
