import type { RealtimeChannel } from '@supabase/supabase-js';
import { useEffect, useRef } from 'react';
import { emitir, escuchar, type PersonaEnLinea } from '../../game/EventBus';
import { supabase } from '../../lib/supabase';
import { useEstado } from '../../ui/estado';
import { useSesion } from '../auth/sesion';

/** Perfiles ya leídos (nombre, insignia y apariencia salen de la base, no de lo que manda cada navegador). */
const perfiles = new Map<string, PersonaEnLinea>();

async function cargarPerfiles(ids: string[]): Promise<void> {
  const faltan = ids.filter((id) => !perfiles.has(id));
  if (!faltan.length) return;
  const { data } = await supabase().from('usuarios').select('id, nombre, verificado, avatar, apariencia').in('id', faltan);
  for (const p of (data ?? []) as PersonaEnLinea[]) perfiles.set(p.id, { ...p, verificado: Boolean(p.verificado) });
}

/**
 * Personas en línea (sin interfaz): un canal privado de Supabase Realtime por villa y sector
 * («villa:creativo:1»), con Presence para saber quién está y Broadcast para las posiciones.
 * - Solo entran personas con sesión (RLS de realtime.messages, migración 20261007000800).
 * - El nombre y la insignia se leen de la tabla de usuarios, no del mensaje: nadie puede ponerse otro nombre.
 * - Las bloqueadas no se dibujan. Phaser recibe todo por el EventBus.
 */
export function PersonasEnLinea() {
  const { usuario } = useSesion();
  const { sector, version } = useEstado();
  const bloqueados = useRef(new Set<string>());
  const republicar = useRef<() => void>(() => undefined);

  // El nombre propio sobre la cabeza.
  useEffect(() => {
    const yo = usuario ? { id: usuario.id, nombre: usuario.nombre, verificado: Boolean(usuario.verificado) } : null;
    emitir('yo-en-linea', yo);
    return escuchar('pueblo-listo', () => emitir('yo-en-linea', yo));
  }, [usuario]);

  // Las personas que bloqueé no aparecen (se vuelve a leer cuando algo cambia).
  useEffect(() => {
    if (!usuario) return;
    void supabase()
      .from('bloqueos')
      .select('bloqueado_id')
      .eq('usuario_id', usuario.id)
      .then(({ data }) => {
        bloqueados.current = new Set(((data ?? []) as { bloqueado_id: string }[]).map((b) => b.bloqueado_id));
        republicar.current();
      });
  }, [usuario, version]);

  // Solo se vuelve a conectar si cambia la cuenta, la villa o el sector (no en cada recarga del perfil).
  const miId = usuario && !usuario.suspendido ? usuario.id : null;
  useEffect(() => {
    if (!miId) {
      emitir('personas', []);
      return;
    }
    const yo = miId;
    const topico = `villa:${sector.barrio}:${sector.sector}`;
    let activo = true;
    let unido = false;
    let canal: RealtimeChannel | null = null;
    let ultima: { x: number; y: number } | null = null;

    const publicar = async () => {
      if (!canal || !activo) return;
      const ids = Object.keys(canal.presenceState()).filter((id) => id !== yo && !bloqueados.current.has(id));
      await cargarPerfiles(ids);
      if (!activo) return;
      emitir('personas', ids.map((id) => perfiles.get(id)).filter((p): p is PersonaEnLinea => Boolean(p)));
    };
    republicar.current = () => void publicar();

    const enviarPosicion = (x: number, y: number) => {
      ultima = { x, y };
      if (unido) void canal?.send({ type: 'broadcast', event: 'pos', payload: { id: yo, x, y } });
    };

    const unirse = async (privado: boolean) => {
      await supabase().realtime.setAuth();
      if (!activo) return;
      const c = supabase().channel(topico, { config: { private: privado, presence: { key: yo }, broadcast: { self: false } } });
      canal = c;
      c.on('presence', { event: 'sync' }, () => void publicar())
        // Alguien llegó: se le manda la posición propia para que no espere al próximo paso.
        .on('presence', { event: 'join' }, () => ultima && enviarPosicion(ultima.x, ultima.y))
        .on('broadcast', { event: 'pos' }, ({ payload }) => {
          const p = payload as { id?: string; x?: number; y?: number };
          if (typeof p.id !== 'string' || p.id === yo || bloqueados.current.has(p.id)) return;
          if (typeof p.x === 'number' && typeof p.y === 'number' && Number.isFinite(p.x) && Number.isFinite(p.y)) emitir('persona-movio', p.id, p.x, p.y);
        })
        .subscribe(async (estado) => {
          if (!activo) return;
          if (estado === 'SUBSCRIBED') {
            unido = true;
            await c.track({ id: yo });
            if (ultima) enviarPosicion(ultima.x, ultima.y);
          } else if (estado === 'CHANNEL_ERROR' && privado) {
            // Sin Realtime Authorization en este proyecto: canal público (igual solo entran personas con sesión de la app).
            console.warn('Personas en línea: el canal privado no está disponible; se usa uno público.');
            unido = false;
            void supabase().removeChannel(c);
            void unirse(false);
          }
        });
    };
    void unirse(true);

    const quitar = [
      escuchar('mi-posicion', enviarPosicion),
      // La escena se volvió a crear (cambio de modo o de tamaño): se le manda de nuevo quién está.
      escuchar('pueblo-listo', () => void publicar()),
    ];
    return () => {
      activo = false;
      republicar.current = () => undefined;
      quitar.forEach((f) => f());
      if (canal) void supabase().removeChannel(canal);
      emitir('personas', []);
    };
  }, [miId, sector.barrio, sector.sector]);

  return null;
}
