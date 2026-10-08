// Rampas: pagar con el QR del banco (bolivianos → USDC) y pasar a mi banco (USDC → cuenta del banco).
// En testnet la rampa es SIMULADA (la API emite USDC de prueba): ver docs/simulaciones.md.
import type { EstadoRampa, SentidoRampa } from '@cryptoville/shared';
import { api } from '../../lib/api';

export interface Rampa {
  id: string;
  sentido: SentidoRampa;
  proveedor: 'simulada' | 'pollar';
  pais: string;
  moneda: string;
  monto_usdc: string;
  monto_local: string;
  tipo_cambio: string;
  comision_local: string;
  direccion: string;
  pedido_id: string | null;
  estado: EstadoRampa;
  referencia: string;
  qr_payload: string | null;
  banco: string | null;
  cuenta_final: string | null;
  tx_hash: string | null;
  expira_en: string;
  creada_en: string;
}

/** Saldo de USDC de una wallet de la cuenta (null si no se pudo leer la red). */
export async function saldoUsdc(direccion: string): Promise<string | null> {
  const r = await api<{ saldo_usdc: string | null }>(`/rampas/saldo?direccion=${encodeURIComponent(direccion)}`);
  return r.saldo_usdc;
}

export function crearRecarga(montoUsdc: string, direccion: string, pedidoId?: string): Promise<Rampa> {
  return api<Rampa>('/rampas/entradas', { cuerpo: { monto_usdc: montoUsdc, direccion, ...(pedidoId ? { pedido_id: pedidoId } : {}) } });
}

/** SIMULADO (solo testnet): hace como si el banco hubiera pagado el QR. */
export function simularPagoDelBanco(id: string): Promise<Rampa> {
  return api<Rampa>(`/rampas/entradas/${id}/simular-pago`, { cuerpo: {} });
}

export function crearRetiro(datos: { monto_usdc: string; direccion: string; banco: string; cuenta: string }): Promise<Rampa> {
  return api<Rampa>('/rampas/salidas', { cuerpo: datos });
}

/** Lo que falta para pagar `monto` con `saldo` (redondeado hacia arriba a centavos; mínimo 1 USDC). */
export function faltaParaPagar(monto: string, saldo: string | null): string {
  const falta = Number(monto) - Number(saldo ?? 0);
  const centavos = Math.ceil(Math.max(falta, 1) * 100) / 100;
  return centavos.toFixed(2);
}
