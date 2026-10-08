import { reglasDe, type RedStellar, type Reglas } from '@cryptoville/shared';

/**
 * Configuración pública que entrega la API en /api/config (así la web no necesita variables al compilar).
 * `servicios` dice qué funciones están encendidas en el servidor: las que están apagadas no se muestran.
 */
export interface ConfigPublica {
  supabase_url: string;
  supabase_anon_key: string;
  red: RedStellar;
  red_nombre?: string;
  passphrase?: string;
  contrato_id: string | null;
  contrato_url: string | null;
  contrato_v2_id?: string | null;
  contrato_v2_url?: string | null;
  token_id: string | null;
  asset: string | null;
  arbitro: string | null;
  tesoreria?: string | null;
  comision_bps: number;
  plazo_revision_seg: number;
  comision_max_bps: number;
  /** Plazos del contrato v2, leídos de la red por la API (o los del archivo de reglas, si no se pudo). */
  plazos_v2?: { revision_seg: number; disputa_seg: number; fuente: 'contrato' | 'reglas' };
  /** Firmar dentro de la app (sin Stellar Lab). */
  firma_en_app?: boolean;
  /** La API verifica cada paso en la red (no hace falta revisarlo a mano). */
  verificacion_en_cadena?: boolean;
  servicios?: {
    pollar_api_key: string | null;
    walletconnect_project_id: string | null;
    kyc: boolean;
    videos: boolean;
    correo: boolean;
    push_publica: string | null;
    entorno: 'pruebas' | 'produccion';
    /** Pagar con el QR del banco / pasar al banco: 'simulada' (solo testnet), 'pollar' (mainnet) o null. */
    rampa?: 'simulada' | 'pollar' | null;
  };
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

/** Reglas de la red actual (comisiones, límites y plazos de packages/shared/src/reglas.ts). */
export function reglas(): Reglas {
  return reglasDe(obtenerConfig().red);
}

/** Plazos del contrato v2: los del contrato (los manda la API) o, si la API no los trae, los del archivo de reglas. */
export function plazosV2(): { revisionSeg: number; disputaMaxSeg: number } {
  const p = obtenerConfig().plazos_v2;
  if (p) return { revisionSeg: p.revision_seg, disputaMaxSeg: p.disputa_seg };
  const r = reglas().plazos;
  return { revisionSeg: r.revisionSeg, disputaMaxSeg: r.disputaMaxSeg };
}

/** Servicios encendidos (con valores por defecto si la API es anterior a v2). */
export function servicios(): NonNullable<ConfigPublica['servicios']> {
  return (
    obtenerConfig().servicios ?? {
      pollar_api_key: null,
      walletconnect_project_id: null,
      kyc: false,
      videos: false,
      correo: false,
      push_publica: null,
      entorno: 'pruebas',
      rampa: null,
    }
  );
}
