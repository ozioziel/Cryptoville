import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { obtenerConfig } from './config';

/**
 * Cliente de Supabase del navegador: SOLO lee (llave anon + RLS) y escucha Realtime.
 * Todas las escrituras van por la API (lib/api.ts).
 */
let cliente: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!cliente) {
    const c = obtenerConfig();
    cliente = createClient(c.supabase_url, c.supabase_anon_key, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'cryptoville-sesion' },
      realtime: { params: { eventsPerSecond: 5 } },
    });
  }
  return cliente;
}
