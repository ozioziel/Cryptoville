import type { AparienciaCasa, AparienciaPersona, Barrio } from '@cryptoville/shared';
import Phaser from 'phaser';

/**
 * Único canal entre Phaser (las villas) y React (los paneles).
 * Phaser nunca importa componentes de React y React nunca toca escenas directamente.
 */
export const EventBus = new Phaser.Events.EventEmitter();

/** Datos de un local que Phaser necesita para dibujarlo. */
export interface LocalEnMapa {
  /** Número de lote dentro de su villa. */
  lote: number;
  nombre: string;
  color: string;
  /** Personaje de Kenney del dueño (se conserva; si no hay `aparienciaDueno`, se usa su persona equivalente). */
  avatarDueno: number;
  /** Villa del local. Si falta, el local no se dibuja en ninguna villa. */
  barrio?: Barrio;
  id?: string;
  aparienciaDueno?: AparienciaPersona | null;
  aparienciaCasa?: AparienciaCasa | null;
}

/**
 * Modo de la villa: «Quiero contratar» muestra las casas de los locales;
 * «Quiero trabajar» muestra una casa por cada «Se busca» abierto.
 */
export type ModoVilla = 'contratar' | 'trabajar';

/** Un «Se busca» abierto, para dibujarlo como casa en el modo «Quiero trabajar». */
export interface SeBuscaEnMapa {
  id: string;
  barrio: Barrio;
  lote: number;
  titulo: string;
  avatarAutor: number;
  aparienciaAutor?: AparienciaPersona | null;
}

/**
 * Una puerta del mapa: un local, un «Se busca», un lote disponible, el edificio central de la villa
 * o el letrero que lleva a otro sector («Creativo B →»).
 */
export interface Puerta {
  tipo: 'local' | 'se-busca' | 'lote-libre' | 'edificio' | 'sector';
  barrio: Barrio;
  /** Lote dentro de la villa, contando todos sus sectores (null en el edificio central y en los letreros). */
  lote: number | null;
  /** «Se busca» de la casa (solo en el modo «Quiero trabajar»). */
  busquedaId?: string;
  /** Sector al que lleva el letrero (1 = el primero, 2 = «B»…). */
  sector?: number;
}

/** Sector de la villa que se está mostrando (cada sector tiene 60 casas; cada modo cuenta aparte). */
export interface SectorActual {
  barrio: Barrio;
  sector: number;
  /** Sectores que hay en esta villa y en este modo. */
  total: number;
}

/** Lo que React le pasa a Phaser para dibujar el interior de un local. */
export interface DatosInterior {
  nombre: string;
  avatarDueno: number;
  aparienciaDueno?: AparienciaPersona | null;
  barrio?: Barrio;
  color?: string;
  aparienciaCasa?: AparienciaCasa | null;
}

/** Una persona con sesión que está en la misma villa y sector (Supabase Presence). */
export interface PersonaEnLinea {
  id: string;
  nombre: string;
  verificado: boolean;
  avatar: number;
  apariencia?: AparienciaPersona | null;
}

/** Un cuadro de la pared del interior: un proyecto destacado del dueño del local. */
export interface CuadroInterior {
  id: string;
  titulo: string;
  /** Primera foto del proyecto (bucket público "fotos"), o null. */
  foto: string | null;
}

export interface EventosJuego {
  /** Phaser → React: la escena de una villa está lista (React vuelve a mandar locales y personaje). */
  'pueblo-listo': [];
  /** Phaser → React: villa que se está mostrando (al llegar a una villa). */
  'villa-actual': [barrio: Barrio];
  /** Phaser → React: sector de la villa que se está mostrando y cuántos hay. */
  'sector-actual': [datos: SectorActual];
  /** Phaser → React: el jugador está frente a una puerta (o se alejó: null). */
  'cerca-de-puerta': [puerta: Puerta | null];
  /** Phaser → React: el jugador entró por una puerta (E, Enter o el botón "Entrar a …"). */
  'entrar-puerta': [puerta: Puerta];
  /**
   * Phaser → React: el jugador está frente a la puerta de un lote (o se alejó: null).
   * @deprecated Un número de lote ya no identifica una casa (cada villa numera sus lotes). Usar 'cerca-de-puerta'.
   */
  'cerca-de-lote': [lote: number | null];
  /** @deprecated Usar 'entrar-puerta' (trae la villa y el lote). */
  'entrar-lote': [lote: number];
  /** Phaser → React: el jugador salió caminando del interior. */
  'salio-del-local': [];
  /** React → Phaser: locales abiertos (de todas las villas) para pintar casas, letreros y dueños. */
  locales: [locales: LocalEnMapa[]];
  /** React → Phaser: «Se busca» abiertos (de todas las villas), las casas del modo «Quiero trabajar». */
  'se-busca': [busquedas: SeBuscaEnMapa[]];
  /** React → Phaser: cambiar el modo de la villa (cambian las casas, no el diseño). */
  modo: [modo: ModoVilla];
  /**
   * React → Phaser: personaje de Kenney del jugador.
   * @deprecated Se sigue escuchando (se dibuja la persona equivalente); usar 'apariencia'.
   */
  avatar: [frame: number];
  /** React → Phaser: persona del jugador. */
  apariencia: [apariencia: AparienciaPersona];
  /** React → Phaser: entrar por la puerta donde está parado el jugador (botón "Entrar a …"). */
  'pedir-entrar': [];
  /** @deprecated Lleva al jugador al lote de la villa actual; usar 'ir-a-local' (villa y lote). */
  'ir-a-lote': [lote: number];
  /** React → Phaser: viajar a una villa (selector de villas). */
  'ir-a-villa': [barrio: Barrio];
  /** React → Phaser: pasar a otro sector de la villa actual (selector de villas). */
  'ir-a-sector': [sector: number];
  /** React → Phaser: llevar al jugador frente a una casa, en su villa (buscador y "Mi local"). */
  'ir-a-local': [destino: { barrio: Barrio; lote: number }];
  /** React → Phaser: mostrar el interior del local (cuando el lote tiene dueño). */
  'abrir-interior': [datos: DatosInterior];
  /** React → Phaser: cerrar el interior y volver a la villa. */
  'cerrar-local': [];
  /** React → Phaser: cuadros del portafolio para la pared del interior (llegan después de abrirlo). */
  'cuadros-interior': [cuadros: CuadroInterior[]];
  /** Phaser → React: tocaron un cuadro de la pared (abrir ese proyecto). */
  'abrir-proyecto': [id: string];
  /** React → Phaser: quién es el jugador (para su nombre sobre la cabeza); null sin sesión. */
  'yo-en-linea': [datos: { id: string; nombre: string; verificado: boolean } | null];
  /** React → Phaser: las personas en línea de esta villa y sector (sin el jugador ni las bloqueadas). */
  personas: [lista: PersonaEnLinea[]];
  /** React → Phaser: una persona se movió (posiciones por Broadcast, 5 a 10 por segundo; se interpolan). */
  'persona-movio': [id: string, x: number, y: number];
  /** React → Phaser: globo sobre la cabeza de alguien (o del jugador, con su id) con lo que escribió. */
  globo: [id: string, texto: string];
  /** Phaser → React: posición del jugador en la villa (se manda como mucho `presencia.posicionesPorSegundo` veces). */
  'mi-posicion': [x: number, y: number];
  /** Phaser → React: hay una persona cerca para hablar (o ya no: null). */
  'cerca-de-persona': [persona: { id: string; nombre: string } | null];
  /** Phaser → React: el jugador quiere hablar con esa persona (tecla H). */
  'hablar-con': [id: string];
  /** React → Phaser: dirección del joystick táctil (-1..1). */
  joystick: [x: number, y: number];
  /** React → Phaser: pausar los controles mientras hay un panel abierto. */
  controles: [activos: boolean];
}

export function emitir<K extends keyof EventosJuego>(evento: K, ...args: EventosJuego[K]): void {
  EventBus.emit(evento, ...args);
}

export function escuchar<K extends keyof EventosJuego>(evento: K, fn: (...args: EventosJuego[K]) => void): () => void {
  EventBus.on(evento, fn);
  return () => {
    EventBus.off(evento, fn);
  };
}
