import type { Aviso } from '@cryptoville/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSesion } from '../features/auth/sesion';
import { cargarPueblo, type LocalDelPueblo } from '../features/services/datos';
import { emitir } from '../game/EventBus';
import { supabase } from '../lib/supabase';

export type PanelAbierto =
  | { tipo: 'bienvenida' }
  | { tipo: 'lote'; lote: number }
  | { tipo: 'servicio'; servicioId: string }
  | { tipo: 'pedidos' }
  | { tipo: 'pedido'; id: string }
  | { tipo: 'perfil' }
  | { tipo: 'mi-local' }
  | { tipo: 'buscar' }
  | { tipo: 'arbitro' }
  | { tipo: 'avisos' };

interface Notificacion {
  id: number;
  texto: string;
  pedidoId: string | null;
}

interface EstadoApp {
  panel: PanelAbierto | null;
  puedeVolver: boolean;
  abrir(p: PanelAbierto): void;
  atras(): void;
  cerrar(): void;
  locales: LocalDelPueblo[];
  recargarPueblo(): Promise<void>;
  /** Cambia cada vez que llega un cambio en vivo (pedidos, pasos, mensajes, avisos). */
  version: number;
  refrescar(): void;
  avisosSinLeer: number;
  setAvisosSinLeer(n: number): void;
  notificaciones: Notificacion[];
  notificar(texto: string, pedidoId?: string | null): void;
  descartar(id: number): void;
}

const Contexto = createContext<EstadoApp | null>(null);

export function ProveedorEstado({ children }: { children: ReactNode }) {
  const { usuario } = useSesion();
  const [pila, setPila] = useState<PanelAbierto[]>([]);
  const [locales, setLocales] = useState<LocalDelPueblo[]>([]);
  const [version, setVersion] = useState(0);
  const [avisosSinLeer, setAvisosSinLeer] = useState(0);
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const siguienteId = useRef(1);

  const abrir = useCallback(
    (p: PanelAbierto) =>
      setPila((s) => (JSON.stringify(s.at(-1)) === JSON.stringify(p) ? s : [...s.slice(-8), p])),
    [],
  );
  const atras = useCallback(() => setPila((s) => s.slice(0, -1)), []);
  const cerrar = useCallback(() => setPila([]), []);
  const refrescar = useCallback(() => setVersion((v) => v + 1), []);

  const notificar = useCallback((texto: string, pedidoId: string | null = null) => {
    const id = siguienteId.current++;
    setNotificaciones((n) => [...n.slice(-3), { id, texto, pedidoId }]);
    setTimeout(() => setNotificaciones((n) => n.filter((x) => x.id !== id)), 7000);
  }, []);
  const descartar = useCallback((id: number) => setNotificaciones((n) => n.filter((x) => x.id !== id)), []);

  const recargarPueblo = useCallback(async () => {
    const datos = await cargarPueblo();
    setLocales(datos);
    emitir(
      'locales',
      datos.map((l) => ({ lote: l.lote, nombre: l.nombre, color: l.color, avatarDueno: l.usuario.avatar })),
    );
  }, []);

  // El pueblo se recarga al iniciar y cada minuto (locales nuevos de otras personas).
  useEffect(() => {
    void recargarPueblo();
    const t = setInterval(() => void recargarPueblo(), 60_000);
    return () => clearInterval(t);
  }, [recargarPueblo]);

  // Avisos y cambios en vivo (Supabase Realtime respeta RLS: solo llega lo que el usuario puede ver).
  useEffect(() => {
    if (!usuario) {
      setAvisosSinLeer(0);
      return;
    }
    let activo = true;
    void supabase()
      .from('avisos')
      .select('id', { count: 'exact', head: true })
      .eq('usuario_id', usuario.id)
      .eq('leido', false)
      .then(({ count }) => activo && setAvisosSinLeer(count ?? 0));

    const canal = supabase()
      .channel(`cryptoville-${usuario.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'avisos', filter: `usuario_id=eq.${usuario.id}` }, (cambio) => {
        const aviso = cambio.new as Aviso;
        setAvisosSinLeer((n) => n + 1);
        notificar(aviso.texto, aviso.pedido_id);
        refrescar();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, refrescar)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pasos_pedido' }, refrescar)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes' }, refrescar)
      .subscribe();
    return () => {
      activo = false;
      void supabase().removeChannel(canal);
    };
  }, [usuario, notificar, refrescar]);

  const panel = pila.at(-1) ?? null;
  // Mientras hay un panel abierto, el personaje no camina.
  useEffect(() => {
    emitir('controles', panel === null);
  }, [panel]);

  const valor = useMemo<EstadoApp>(
    () => ({
      panel,
      puedeVolver: pila.length > 1,
      abrir,
      atras,
      cerrar,
      locales,
      recargarPueblo,
      version,
      refrescar,
      avisosSinLeer,
      setAvisosSinLeer,
      notificaciones,
      notificar,
      descartar,
    }),
    [panel, pila.length, abrir, atras, cerrar, locales, recargarPueblo, version, refrescar, avisosSinLeer, notificaciones, notificar, descartar],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useEstado(): EstadoApp {
  const e = useContext(Contexto);
  if (!e) throw new Error('useEstado fuera de ProveedorEstado');
  return e;
}
