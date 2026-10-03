import Phaser from 'phaser';

/**
 * Único canal entre Phaser (el pueblo) y React (los paneles).
 * Phaser nunca importa componentes de React y React nunca toca escenas directamente.
 */
export const EventBus = new Phaser.Events.EventEmitter();

/** Datos de un local que Phaser necesita para dibujarlo. */
export interface LocalEnMapa {
  lote: number;
  nombre: string;
  color: string;
  avatarDueno: number;
}

export interface EventosJuego {
  /** Phaser → React: la escena del pueblo está lista. */
  'pueblo-listo': [];
  /** Phaser → React: el jugador está frente a una puerta (o se alejó: null). */
  'cerca-de-lote': [lote: number | null];
  /** Phaser → React: el jugador entró al lote. */
  'entrar-lote': [lote: number];
  /** Phaser → React: el jugador salió caminando del interior. */
  'salio-del-local': [];
  /** React → Phaser: locales abiertos para pintar letreros y dueños. */
  locales: [locales: LocalEnMapa[]];
  /** React → Phaser: personaje del jugador. */
  avatar: [frame: number];
  /** React → Phaser: entrar al lote donde está parado el jugador (botón "Entrar"). */
  'pedir-entrar': [];
  /** React → Phaser: llevar al jugador frente a un lote (desde el buscador). */
  'ir-a-lote': [lote: number];
  /** React → Phaser: mostrar el interior del local (cuando el lote tiene dueño). */
  'abrir-interior': [datos: { nombre: string; avatarDueno: number }];
  /** React → Phaser: cerrar el interior y volver al pueblo. */
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
