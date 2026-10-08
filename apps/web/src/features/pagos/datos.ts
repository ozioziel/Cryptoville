// Lectura de las fases y las pruebas de un pedido (Supabase con RLS: solo las partes y el árbitro).
// Las escrituras van por la API (/api/pedidos/:id/plan, /pruebas, /transacciones…).
import { formatoUsdc, type Fase, type TipoPrueba } from '@cryptoville/shared';
import { supabase } from '../../lib/supabase';

export interface PruebaDeFase {
  id: string;
  pedido_id: string;
  fase: number;
  autor_id: string;
  para: 'entrega' | 'disputa';
  tipo: TipoPrueba;
  titulo: string;
  url: string | null;
  ruta: string | null;
  video_id: string | null;
  mime: string | null;
  tamano: number | null;
  huella: string;
  entrega: number;
  sellada_en: string | null;
  creada_en: string;
}

export async function cargarFases(pedidoId: string): Promise<Fase[]> {
  const { data, error } = await supabase().from('fases').select('*').eq('pedido_id', pedidoId).order('numero');
  if (error) throw new Error('No se pudieron cargar las fases');
  return ((data ?? []) as Fase[]).map((f) => ({ ...f, monto_usdc: formatoUsdc(f.monto_usdc) }));
}

export async function cargarPruebas(pedidoId: string): Promise<PruebaDeFase[]> {
  const { data, error } = await supabase().from('pruebas').select('*').eq('pedido_id', pedidoId).order('creada_en');
  if (error) throw new Error('No se pudieron cargar las pruebas');
  return (data ?? []) as PruebaDeFase[];
}

/** Fecha de un campo "datetime-local" (hora local) a ISO, y al revés. */
export function aIso(local: string): string {
  return new Date(local).toISOString();
}

export function aLocal(iso: string): string {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/** SHA-256 (hex) de un archivo en el navegador (para mostrar la huella antes de subirlo). */
export async function huellaArchivo(archivo: File): Promise<string> {
  const resumen = await crypto.subtle.digest('SHA-256', await archivo.arrayBuffer());
  return [...new Uint8Array(resumen)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
