import type { Aviso, Barrio, DocumentoLegal } from '@cryptoville/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSesion } from '../features/auth/sesion';
import { cargarSeBusca, seBuscaEnMapa, type BusquedaPublica } from '../features/busquedas/datos';
import { cargarPueblo, localEnMapa, type LocalDelPueblo } from '../features/services/datos';
import { emitir, escuchar, type ModoVilla, type SectorActual } from '../game/EventBus';
import { guardarModo, guardarVilla, modoGuardado, villaGuardada } from '../game/villaInicial';
import { supabase } from '../lib/supabase';
import type { TipoReporte } from './components/Confianza';

export type PanelAbierto =
  | { tipo: 'bienvenida' }
  /** Casa o lote disponible. `barrio` dice en qué villa (si falta, la villa actual). */
  | { tipo: 'lote'; lote: number; barrio?: Barrio }
  | { tipo: 'servicio'; servicioId: string }
  | { tipo: 'pedidos' }
  | { tipo: 'pedido'; id: string }
  | { tipo: 'perfil' }
  /** Editar uno de mis locales (sin id: el principal; «nuevo»: abrir otro). */
  | { tipo: 'mi-local'; localId?: string }
  /** Mis locales: la lista, el cupo (3 gratis) y el pago del local extra. */
  | { tipo: 'mis-locales' }
  /** Perfil → Personalizar: «Mi personaje» o «Un local» (y cuál). */
  | { tipo: 'personalizar' }
  /** El editor de mi personaje. */
  | { tipo: 'personaje' }
  /** El portafolio de una persona (experiencia y proyectos). */
  | { tipo: 'portafolio'; usuarioId: string }
  /** Un proyecto del portafolio. */
  | { tipo: 'proyecto'; id: string }
  /** Editar mi portafolio. */
  | { tipo: 'mi-portafolio' }
  /** Buscador: "Servicios" (Quiero contratar) o "Se busca" (Quiero trabajar). */
  | { tipo: 'buscar'; pestana?: PestanaBuscar }
  | { tipo: 'arbitro' }
  | { tipo: 'avisos' }
  | { tipo: 'datos-curiosos'; barrio: Barrio }
  | { tipo: 'busqueda'; id: string }
  | { tipo: 'publicar-busqueda'; barrio?: Barrio }
  /** Un documento legal (términos, privacidad, comisiones y reglas…). */
  | { tipo: 'legal'; documento: DocumentoLegal }
  /** Aceptar los documentos legales nuevos o que cambiaron. */
  | { tipo: 'aceptar-legal' }
  /** «Enviar comentarios»: una idea o un error para el equipo. */
  | { tipo: 'comentarios' }
  /** Comentarios recibidos (panel del equipo). */
  | { tipo: 'comentarios-equipo' }
  /** Mis wallets: sumar otra, elegir dónde cobrar, quitar. */
  | { tipo: 'wallets' }
  /** Pasar USDC a mi cuenta del banco (rampa; simulada en testnet). */
  | { tipo: 'retiro' }
  /** Reportar contenido o a una persona. */
  | { tipo: 'reportar'; reporte: TipoReporte; objetoId: string; nombre: string }
  /** Avisos fuera de la app (navegador y correo) y personas bloqueadas. */
  | { tipo: 'avisos-config' };

export type PestanaBuscar = 'servicios' | 'se-busca';

/** Tipo de aviso breve: información, éxito, error o algo que está cargando. */
export type TipoNotificacion = 'info' | 'exito' | 'error' | 'cargando';

interface Notificacion {
  id: number;
  texto: string;
  pedidoId: string | null;
  /** «Se busca» al que lleva la notificación (propuestas). */
  busquedaId: string | null;
  /** Persona que escribió por el chat de cercanía (abrir su ventanita). */
  personaId?: string | null;
  tipo: TipoNotificacion;
}

/** Un mensaje del chat por cercanía (tabla mensajes_cercania). */
export interface MensajeCercania {
  id: string;
  de_id: string;
  para_id: string;
  texto: string;
  creado_en: string;
}

/** Cuánto dura cada tipo de aviso en pantalla (los de "cargando" se quedan hasta que se reemplazan). */
const DURACION: Record<TipoNotificacion, number> = { info: 7000, exito: 5000, error: 10000, cargando: 60000 };

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
  /** Sector de la villa que se está mostrando (1 = el primero, 2 = «B»…) y cuántos hay en este modo. */
  sector: SectorActual;
  irASector(sector: number): void;
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
  notificar(texto: string, pedidoId?: string | null, busquedaId?: string | null, tipo?: TipoNotificacion): void;
  /**
   * Aviso breve de éxito, error o "cargando" (un solo componente para toda la app).
   * Devuelve su id: pasándolo en `reemplazar`, un "cargando" se convierte en el resultado.
   */
  avisar(texto: string, tipo?: TipoNotificacion, reemplazar?: number): number;
  descartar(id: number): void;
  /** Chat por cercanía: con quién está abierta la ventanita (id de la persona) y el último mensaje que llegó o salió. */
  chatCon: string | null;
  abrirChat(personaId: string): void;
  cerrarChat(): void;
  mensajeCercania: MensajeCercania | null;
  /** El chat avisa que salió un mensaje (para mostrarlo sin esperar a Realtime). */
  registrarMensaje(m: MensajeCercania): void;
}

const Contexto = createContext<EstadoApp | null>(null);

export function ProveedorEstado({ children }: { children: ReactNode }) {
  const { usuario } = useSesion();
  const [pila, setPila] = useState<PanelAbierto[]>([]);
  const [locales, setLocales] = useState<LocalDelPueblo[]>([]);
  const [villa, setVilla] = useState<Barrio>(villaGuardada);
  const [sector, setSector] = useState<SectorActual>(() => ({ barrio: villaGuardada(), sector: 1, total: 1 }));
  const [modo, setModo] = useState<ModoVilla>(modoGuardado);
  const [seBusca, setSeBusca] = useState<BusquedaPublica[]>([]);
  const [version, setVersion] = useState(0);
  const [avisosSinLeer, setAvisosSinLeer] = useState(0);
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const siguienteId = useRef(1);
  const [chatCon, setChatCon] = useState<string | null>(null);
  const [mensajeCercania, setMensajeCercania] = useState<MensajeCercania | null>(null);
  const chatConRef = useRef<string | null>(null);
  chatConRef.current = chatCon;
  const abrirChat = useCallback((id: string) => setChatCon(id), []);
  const cerrarChat = useCallback(() => setChatCon(null), []);
  const registrarMensaje = useCallback((m: MensajeCercania) => setMensajeCercania(m), []);

  const abrir = useCallback(
    (p: PanelAbierto) =>
      setPila((s) => (JSON.stringify(s.at(-1)) === JSON.stringify(p) ? s : [...s.slice(-8), p])),
    [],
  );
  const atras = useCallback(() => setPila((s) => s.slice(0, -1)), []);
  const cerrar = useCallback(() => setPila([]), []);
  const cambiar = useCallback((p: PanelAbierto) => setPila((s) => [...s.slice(0, -1), p]), []);
  const refrescar = useCallback(() => setVersion((v) => v + 1), []);

  const notificar = useCallback(
    (texto: string, pedidoId: string | null = null, busquedaId: string | null = null, tipo: TipoNotificacion = 'info') => {
      const id = siguienteId.current++;
      setNotificaciones((n) => [...n.slice(-3), { id, texto, pedidoId, busquedaId, tipo }]);
      setTimeout(() => setNotificaciones((n) => n.filter((x) => x.id !== id)), DURACION[tipo]);
    },
    [],
  );
  const avisar = useCallback((texto: string, tipo: TipoNotificacion = 'info', reemplazar?: number) => {
    const id = siguienteId.current++;
    setNotificaciones((n) => [...n.filter((x) => x.id !== reemplazar).slice(-3), { id, texto, pedidoId: null, busquedaId: null, tipo }]);
    setTimeout(() => setNotificaciones((n) => n.filter((x) => x.id !== id)), DURACION[tipo]);
    return id;
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
  useEffect(() => escuchar('sector-actual', setSector), []);
  const irASector = useCallback((s: number) => {
    setPila([]);
    emitir('ir-a-sector', s);
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
      // Chat por cercanía: el globo aparece sobre la cabeza de quien escribió; si su ventanita está cerrada, un aviso.
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes_cercania', filter: `para_id=eq.${usuario.id}` }, (cambio) => {
        const m = cambio.new as MensajeCercania;
        setMensajeCercania(m);
        emitir('globo', m.de_id, m.texto);
        if (chatConRef.current === m.de_id) return;
        void supabase()
          .from('usuarios')
          .select('nombre')
          .eq('id', m.de_id)
          .maybeSingle()
          .then(({ data }) => {
            const nombre = (data as { nombre: string } | null)?.nombre ?? 'Alguien';
            const id = siguienteId.current++;
            const corto = m.texto.length > 60 ? `${m.texto.slice(0, 60)}…` : m.texto;
            setNotificaciones((n) => [...n.slice(-3), { id, texto: `${nombre} te escribió: «${corto}»`, pedidoId: null, busquedaId: null, personaId: m.de_id, tipo: 'info' }]);
            setTimeout(() => setNotificaciones((n) => n.filter((x) => x.id !== id)), DURACION.info);
          });
      })
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
      sector,
      irASector,
      modo,
      cambiarModo,
      seBusca,
      version,
      refrescar,
      avisosSinLeer,
      setAvisosSinLeer,
      notificaciones,
      notificar,
      avisar,
      descartar,
      chatCon,
      abrirChat,
      cerrarChat,
      mensajeCercania,
      registrarMensaje,
    }),
    [panel, pila.length, abrir, atras, cerrar, cambiar, locales, recargarPueblo, villa, irAVilla, sector, irASector, modo, cambiarModo, seBusca, version, refrescar, avisosSinLeer, notificaciones, notificar, avisar, descartar, chatCon, abrirChat, cerrarChat, mensajeCercania, registrarMensaje],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useEstado(): EstadoApp {
  const e = useContext(Contexto);
  if (!e) throw new Error('useEstado fuera de ProveedorEstado');
  return e;
}
