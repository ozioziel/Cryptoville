import { supabase } from './supabase';

/** Error de la API con el mensaje en español que devuelve el servidor. */
export class ErrorApi extends Error {
  constructor(
    readonly estado: number,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

/** Llama a la API de WorkVille (escrituras). Agrega la sesión si existe. */
export async function api<T = unknown>(ruta: string, opciones: { metodo?: string; cuerpo?: unknown } = {}): Promise<T> {
  const { data } = await supabase().auth.getSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  const r = await fetch(`/api${ruta}`, {
    method: opciones.metodo ?? (opciones.cuerpo === undefined ? 'GET' : 'POST'),
    headers,
    body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
  });
  const texto = await r.text();
  const json = texto ? JSON.parse(texto) : null;
  if (!r.ok) {
    const m = json?.mensaje;
    throw new ErrorApi(r.status, Array.isArray(m) ? m.join('. ') : (m ?? 'Algo salió mal'));
  }
  return json as T;
}

export function mensajeDeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null && 'message' in e) return String((e as { message: unknown }).message);
  return 'Algo salió mal';
}
