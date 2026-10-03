import type { RedStellar } from '@cryptoville/shared';

/** Configuración pública que entrega la API en /api/config (así la web no necesita variables al compilar). */
export interface ConfigPublica {
  supabase_url: string;
  supabase_anon_key: string;
  red: RedStellar;
  contrato_id: string | null;
  contrato_url: string | null;
  token_id: string | null;
  asset: string | null;
  arbitro: string | null;
  comision_bps: number;
  plazo_revision_seg: number;
  comision_max_bps: number;
}

let config: ConfigPublica | null = null;

export async function cargarConfig(): Promise<ConfigPublica> {
  if (config) return config;
  const r = await fetch('/api/config');
  if (!r.ok) throw new Error('No se pudo conectar con la API de Cryptoville');
  config = (await r.json()) as ConfigPublica;
  return config;
}

export function obtenerConfig(): ConfigPublica {
  if (!config) throw new Error('La configuración todavía no se cargó');
  return config;
}
