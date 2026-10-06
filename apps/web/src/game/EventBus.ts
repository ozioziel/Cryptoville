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

/** Una puerta del mapa: un local, un «Se busca», un lote disponible o el edificio central de la villa. */
export interface Puerta {
  tipo: 'local' | 'se-busca' | 'lote-libre' | 'edificio';
  barrio: Barrio;
  /** Lote dentro de la villa (null en el edificio central). */
  lote: number | null;
  /** «Se busca» de la casa (solo en el modo «Quiero trabajar»). */
  busquedaId?: string;
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

export interface EventosJuego {
  /** Phaser → React: la escena de una villa está lista (React vuelve a mandar locales y personaje). */
  'pueblo-listo': [];
  /** Phaser → React: villa que se está mostrando (al llegar a una villa). */
  'villa-actual': [barrio: Barrio];
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
  /** React → Phaser: llevar al jugador frente a una casa, en su villa (buscador y "Mi local"). */
  'ir-a-local': [destino: { barrio: Barrio; lote: number }];
  /** React → Phaser: mostrar el interior del local (cuando el lote tiene dueño). */
  'abrir-interior': [datos: DatosInterior];
  /** React → Phaser: cerrar el interior y volver a la villa. */
  'cerrar-local': [];
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
