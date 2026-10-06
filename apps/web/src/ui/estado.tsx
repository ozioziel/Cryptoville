import type { Aviso, Barrio } from '@cryptoville/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSesion } from '../features/auth/sesion';
import { cargarSeBusca, seBuscaEnMapa, type BusquedaPublica } from '../features/busquedas/datos';
import { cargarPueblo, localEnMapa, type LocalDelPueblo } from '../features/services/datos';
import { emitir, escuchar, type ModoVilla } from '../game/EventBus';
import { guardarModo, guardarVilla, modoGuardado, villaGuardada } from '../game/villaInicial';
import { supabase } from '../lib/supabase';

export type PanelAbierto =
  | { tipo: 'bienvenida' }
  /** Casa o lote disponible. `barrio` dice en qué villa (si falta, la villa actual). */
  | { tipo: 'lote'; lote: number; barrio?: Barrio }
  | { tipo: 'servicio'; servicioId: string }
  | { tipo: 'pedidos' }
  | { tipo: 'pedido'; id: string }
  | { tipo: 'perfil' }
  | { tipo: 'mi-local' }
  /** Buscador: "Servicios" (Quiero contratar) o "Se busca" (Quiero trabajar). */
  | { tipo: 'buscar'; pestana?: PestanaBuscar }
  | { tipo: 'arbitro' }
  | { tipo: 'avisos' }
  | { tipo: 'datos-curiosos'; barrio: Barrio }
  | { tipo: 'busqueda'; id: string }
  | { tipo: 'publicar-busqueda'; barrio?: Barrio };

export type PestanaBuscar = 'servicios' | 'se-busca';

interface Notificacion {
  id: number;
  texto: string;
  pedidoId: string | null;
  /** «Se busca» al que lleva la notificación (propuestas). */
  busquedaId: string | null;
}

interface EstadoApp {
  panel: PanelAbierto | null;
  puedeVolver: boolean;
  abrir(p: PanelAbierto): void;
  atras(): void;
  cerrar(): void;
  /** Cambia el panel de arriba por otro (sin sumar un paso para "volver"). */
  cambiar(p: PanelAbierto): void;
  locales: LocalDelPueblo[];
  recargarPueblo(): Promise<void>;
  /** Villa que se está mostrando. */
  villa: Barrio;
  /** Viajar a otra villa (cierra los paneles). */
  irAVilla(barrio: Barrio): void;
  /** Modo de la villa: «Quiero contratar» (casas de los locales) o «Quiero trabajar» (casas de los «Se busca»). */
  modo: ModoVilla;
  cambiarModo(modo: ModoVilla): void;
  /** «Se busca» abiertos: las casas del modo «Quiero trabajar». */
  seBusca: BusquedaPublica[];
  /** Cambia cada vez que llega un cambio en vivo (pedidos, pasos, mensajes, avisos). */
  version: number;
  refrescar(): void;
  avisosSinLeer: number;
  setAvisosSinLeer(n: number): void;
  notificaciones: Notificacion[];
  notificar(texto: string, pedidoId?: string | null, busquedaId?: string | null): void;
  descartar(id: number): void;
}

const Contexto = createContext<EstadoApp | null>(null);

export function ProveedorEstado({ children }: { children: ReactNode }) {
  const { usuario } = useSesion();
  const [pila, setPila] = useState<PanelAbierto[]>([]);
  const [locales, setLocales] = useState<LocalDelPueblo[]>([]);
  const [villa, setVilla] = useState<Barrio>(villaGuardada);
  const [modo, setModo] = useState<ModoVilla>(modoGuardado);
  const [seBusca, setSeBusca] = useState<BusquedaPublica[]>([]);
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
  const cambiar = useCallback((p: PanelAbierto) => setPila((s) => [...s.slice(0, -1), p]), []);
  const refrescar = useCallback(() => setVersion((v) => v + 1), []);

  const notificar = useCallback((texto: string, pedidoId: string | null = null, busquedaId: string | null = null) => {
    const id = siguienteId.current++;
    setNotificaciones((n) => [...n.slice(-3), { id, texto, pedidoId, busquedaId }]);
    setTimeout(() => setNotificaciones((n) => n.filter((x) => x.id !== id)), 7000);
  }, []);
  const descartar = useCallback((id: number) => setNotificaciones((n) => n.filter((x) => x.id !== id)), []);

  const recargarPueblo = useCallback(async () => {
    const datos = await cargarPueblo();
    setLocales(datos);
    emitir('locales', datos.map(localEnMapa));
  }, []);

  // Phaser avisa a qué villa llegó el jugador (selector, buscador o al iniciar).
  useEffect(
    () =>
      escuchar('villa-actual', (b) => {
        setVilla(b);
        guardarVilla(b);
      }),
    [],
  );
  const irAVilla = useCallback((b: Barrio) => {
    setPila([]);
    emitir('ir-a-villa', b);
  }, []);

  const cambiarModo = useCallback((m: ModoVilla) => {
    setModo(m);
    guardarModo(m);
    emitir('modo', m);
  }, []);

  // Los «Se busca» abiertos son las casas del modo «Quiero trabajar» (lectura pública).
  const recargarSeBusca = useCallback(async () => {
    try {
      const datos = await cargarSeBusca();
      setSeBusca(datos);
      emitir('se-busca', datos.map(seBuscaEnMapa));
    } catch {
      // Sin conexión: se mantienen los últimos que se cargaron.
    }
  }, []);
  useEffect(() => {
    void recargarSeBusca();
  }, [recargarSeBusca, version]);

  // El pueblo se recarga al iniciar y cada minuto (locales nuevos de otras personas).
  useEffect(() => {
    void recargarPueblo();
    const t = setInterval(() => {
      void recargarPueblo();
      void recargarSeBusca();
    }, 60_000);
    return () => clearInterval(t);
  }, [recargarPueblo, recargarSeBusca]);

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
        notificar(aviso.texto, aviso.pedido_id, aviso.busqueda_id ?? null);
        refrescar();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, refrescar)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pasos_pedido' }, refrescar)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes' }, refrescar)
      // «Se busca»: carteles nuevos o cerrados y propuestas (RLS: solo las que el usuario puede ver).
      .on('postgres_changes', { event: '*', schema: 'public', table: 'busquedas' }, refrescar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'propuestas' }, refrescar)
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
      cambiar,
      locales,
      recargarPueblo,
      villa,
      irAVilla,
      modo,
      cambiarModo,
      seBusca,
      version,
      refrescar,
      avisosSinLeer,
      setAvisosSinLeer,
      notificaciones,
      notificar,
      descartar,
    }),
    [panel, pila.length, abrir, atras, cerrar, cambiar, locales, recargarPueblo, villa, irAVilla, modo, cambiarModo, seBusca, version, refrescar, avisosSinLeer, notificaciones, notificar, descartar],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useEstado(): EstadoApp {
  const e = useContext(Contexto);
  if (!e) throw new Error('useEstado fuera de ProveedorEstado');
  return e;
}
