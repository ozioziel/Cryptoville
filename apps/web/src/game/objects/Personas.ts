import { aparienciaDeUsuario, type AparienciaPersona } from '@cryptoville/shared';
import Phaser from 'phaser';
import { cuadroPersona, rumboPersona, type RumboPersona } from '../animacionPersona';
import { LADO_INSIGNIA, crearInsignia } from '../../arte/villa';
import type { PersonaEnLinea } from '../EventBus';
import { asegurarTextura, marcarPermanente, soltarTextura, texto, usarTextura } from '../texturas';
import { ALTO_JUGADOR } from './Jugador';

/** Profundidad de los nombres y globos: siempre por encima de casas y árboles. */
const PROFUNDIDAD_NOMBRE = 900_000;
const PROFUNDIDAD_GLOBO = 950_000;
/** Cuánto dura un globo sobre la cabeza. */
const DURACION_GLOBO = 6_000;
const ANCHO_GLOBO = 170;

interface Opciones {
  resolucion: number;
  maxVisibles: number;
  /** Distancia (px del mundo) a la que aparece «Hablar con… [H]». */
  distancia: number;
  clavePersona: (a: AparienciaPersona) => string;
  texturaPersona: (clave: string, a: AparienciaPersona) => Promise<boolean>;
}

/** El nombre sobre la cabeza (con su insignia ✔ si verificó su identidad). */
class Rotulo {
  readonly texto: Phaser.GameObjects.Text;
  private insignia: Phaser.GameObjects.Image | null = null;

  constructor(escena: Phaser.Scene, nombre: string, verificado: boolean, resolucion: number, propio: boolean) {
    this.texto = texto(escena, 0, 0, nombre, { tamano: 11, peso: 800, color: propio ? '#b85a42' : '#3b2a25' }, resolucion * 1.5).setDepth(PROFUNDIDAD_NOMBRE);
    this.texto.setBackgroundColor('rgba(253, 246, 227, 0.92)').setPadding(5, 2, verificado ? LADO_INSIGNIA + 8 : 5, 2);
    while (this.texto.width > 140 && this.texto.text.length > 4) this.texto.setText(`${this.texto.text.slice(0, -2).trimEnd()}…`);
    if (verificado) {
      const clave = `insignia@${resolucion}`;
      marcarPermanente(clave);
      void asegurarTextura(escena, clave, (t) => crearInsignia(t), LADO_INSIGNIA, LADO_INSIGNIA, resolucion).then((ok) => {
        if (ok && this.texto.active) this.insignia = escena.add.image(0, 0, clave).setScale(1 / resolucion).setDepth(PROFUNDIDAD_NOMBRE + 1);
      });
    }
  }

  colocar(x: number, y: number, visible: boolean): void {
    this.texto.setPosition(x, y).setVisible(visible);
    this.insignia?.setPosition(x + this.texto.width / 2 - LADO_INSIGNIA / 2 - 4, y).setVisible(visible);
  }

  destruir(): void {
    this.texto.destroy();
    this.insignia?.destroy();
  }
}

/** Globo con lo que escribió alguien, sobre su nombre. */
class Globo {
  private readonly contenedor: Phaser.GameObjects.Container;
  private readonly alto: number;
  readonly vence: number;

  constructor(escena: Phaser.Scene, contenido: string, resolucion: number) {
    const t = texto(escena, 0, 0, contenido, { tamano: 12, peso: 600, color: '#3b2a25' }, resolucion * 1.5).setOrigin(0.5, 1);
    t.setWordWrapWidth(ANCHO_GLOBO - 20, true);
    if (t.height > 64) {
      // Hasta 4 líneas: lo demás queda en la ventanita del chat.
      let corto = contenido;
      while (t.height > 64 && corto.length > 8) {
        corto = corto.slice(0, -8);
        t.setText(`${corto.trimEnd()}…`);
      }
    }
    const ancho = Math.min(ANCHO_GLOBO, Math.max(40, t.width + 20));
    this.alto = t.height + 14;
    // Un rectángulo chico por globo: se dibuja una sola vez (no es una figura grande repetida).
    const fondo = escena.add.graphics();
    fondo.fillStyle(0xfdf6e3, 1).lineStyle(2, 0x3b2a25, 1);
    fondo.fillRoundedRect(-ancho / 2, -this.alto - 6, ancho, this.alto, 10).strokeRoundedRect(-ancho / 2, -this.alto - 6, ancho, this.alto, 10);
    fondo.fillTriangle(-6, -7, 6, -7, 0, 0).lineBetween(-6, -6, 0, 0).lineBetween(6, -6, 0, 0);
    t.setPosition(0, -13);
    this.contenedor = escena.add.container(0, 0, [fondo, t]).setDepth(PROFUNDIDAD_GLOBO);
    this.vence = escena.time.now + DURACION_GLOBO;
    escena.tweens.add({ targets: this.contenedor, alpha: 0, delay: DURACION_GLOBO - 400, duration: 400 });
  }

  colocar(x: number, y: number, visible: boolean): void {
    this.contenedor.setPosition(x, y).setVisible(visible);
  }

  destruir(): void {
    this.contenedor.destroy();
  }
}

interface Otra {
  rumbo: RumboPersona;
  inicioPaso: number | null;
  datos: PersonaEnLinea;
  clave: string;
  sprite: Phaser.GameObjects.Image | null;
  rotulo: Rotulo;
  globo: Globo | null;
  x: number;
  y: number;
  objetivo: { x: number; y: number } | null;
  visible: boolean;
}

/**
 * Las personas en línea de la villa (otras cuentas con sesión en el mismo sector), sus nombres y globos.
 * Llegan por el EventBus desde React (Supabase Presence y Broadcast): Phaser no habla con la red.
 * - Se dibujan como mucho las `maxVisibles` más cercanas.
 * - Las posiciones se interpolan, así se ven fluidas aunque lleguen 8 por segundo.
 */
export class PersonasEnVilla {
  private readonly otras = new Map<string, Otra>();
  private propio: { id: string; rotulo: Rotulo; globo: Globo | null } | null = null;
  private proximoOrden = 0;
  private cercana: string | null = null;

  constructor(
    private readonly escena: Phaser.Scene,
    private readonly o: Opciones,
  ) {}

  /** El nombre del jugador sobre su cabeza (null sin sesión). */
  ponerPropio(datos: { id: string; nombre: string; verificado: boolean } | null): void {
    this.propio?.rotulo.destruir();
    this.propio?.globo?.destruir();
    this.propio = datos ? { id: datos.id, rotulo: new Rotulo(this.escena, datos.nombre, datos.verificado, this.o.resolucion, true), globo: null } : null;
  }

  actualizarLista(lista: PersonaEnLinea[]): void {
    const ids = new Set(lista.map((p) => p.id));
    for (const [id, otra] of this.otras) if (!ids.has(id)) this.quitar(id, otra);
    for (const p of lista) {
      const actual = this.otras.get(p.id);
      if (actual && JSON.stringify(actual.datos) === JSON.stringify(p)) continue;
      if (actual) this.quitar(p.id, actual);
      this.agregar(p, actual);
    }
  }

  mover(id: string, x: number, y: number): void {
    const otra = this.otras.get(id);
    if (!otra) return;
    if (!otra.objetivo) {
      // Primera posición: aparece ahí mismo.
      otra.x = x;
      otra.y = y;
    }
    otra.objetivo = { x, y };
  }

  globo(id: string, contenido: string): void {
    if (this.propio?.id === id) {
      this.propio.globo?.destruir();
      this.propio.globo = new Globo(this.escena, contenido, this.o.resolucion);
      return;
    }
    const otra = this.otras.get(id);
    if (!otra) return;
    otra.globo?.destruir();
    otra.globo = new Globo(this.escena, contenido, this.o.resolucion);
  }

  /** Cada cuadro: interpola, ordena por cercanía y devuelve quién está para hablar (si cambió, `cambio` es true). */
  actualizar(jugador: { x: number; y: number }, ahora: number, delta: number): { cercana: PersonaEnLinea | null; cambio: boolean } {
    const k = Math.min(1, (delta / 1000) * 12);
    for (const otra of this.otras.values()) {
      if (otra.objetivo) {
        const dx = otra.objetivo.x - otra.x;
        const dy = otra.objetivo.y - otra.y;
        const caminando = Math.hypot(dx, dy) > 0.5;
        if (caminando) {
          otra.rumbo = rumboPersona(dx, dy, otra.rumbo);
          otra.inicioPaso ??= ahora;
        } else otra.inicioPaso = null;
        otra.x += dx * k;
        otra.y += (otra.objetivo.y - otra.y) * k;
        const cuadro = cuadroPersona(otra.rumbo, caminando, ahora - (otra.inicioPaso ?? ahora));
        if (otra.sprite?.texture.has(cuadro)) otra.sprite.setFrame(cuadro);
      }
    }
    // Las más cercanas primero (cada medio segundo alcanza).
    if (ahora >= this.proximoOrden) {
      this.proximoOrden = ahora + 500;
      const orden = [...this.otras.values()].filter((p) => p.objetivo).sort((a, b) => distancia(a, jugador) - distancia(b, jugador));
      orden.forEach((p, i) => (p.visible = i < this.o.maxVisibles));
    }
    let mejor: Otra | null = null;
    let mejorDistancia = this.o.distancia;
    for (const otra of this.otras.values()) {
      const visible = otra.visible && Boolean(otra.objetivo);
      otra.sprite?.setPosition(otra.x, otra.y).setDepth(otra.y).setVisible(visible);
      otra.rotulo.colocar(otra.x, otra.y - ALTO_JUGADOR - 10, visible);
      if (otra.globo) {
        if (ahora > otra.globo.vence) {
          otra.globo.destruir();
          otra.globo = null;
        } else otra.globo.colocar(otra.x, otra.y - ALTO_JUGADOR - 22, visible);
      }
      const d = distancia(otra, jugador);
      if (visible && d < mejorDistancia) {
        mejor = otra;
        mejorDistancia = d;
      }
    }
    if (this.propio) {
      this.propio.rotulo.colocar(jugador.x, jugador.y - ALTO_JUGADOR - 10, true);
      if (this.propio.globo) {
        if (ahora > this.propio.globo.vence) {
          this.propio.globo.destruir();
          this.propio.globo = null;
        } else this.propio.globo.colocar(jugador.x, jugador.y - ALTO_JUGADOR - 22, true);
      }
    }
    const id = mejor?.datos.id ?? null;
    const cambio = id !== this.cercana;
    this.cercana = id;
    return { cercana: mejor?.datos ?? null, cambio };
  }

  destruir(): void {
    for (const [id, otra] of this.otras) this.quitar(id, otra);
    this.ponerPropio(null);
  }

  private agregar(p: PersonaEnLinea, anterior?: Otra): void {
    const apariencia = aparienciaDeUsuario({ avatar: p.avatar, apariencia: p.apariencia ?? null });
    const clave = this.o.clavePersona(apariencia);
    usarTextura(clave);
    const otra: Otra = {
      rumbo: anterior?.rumbo ?? 'frente',
      inicioPaso: null,
      datos: p,
      clave,
      sprite: null,
      rotulo: new Rotulo(this.escena, p.nombre, p.verificado, this.o.resolucion, false),
      globo: null,
      x: anterior?.x ?? 0,
      y: anterior?.y ?? 0,
      objetivo: anterior?.objetivo ?? null,
      visible: anterior?.visible ?? true,
    };
    this.otras.set(p.id, otra);
    void this.o.texturaPersona(clave, apariencia).then((ok) => {
      if (!ok || this.otras.get(p.id) !== otra) return;
      otra.sprite = this.escena.add.image(otra.x, otra.y, clave).setOrigin(0.5, 1).setScale(1 / this.o.resolucion);
    });
  }

  private quitar(id: string, otra: Otra): void {
    this.otras.delete(id);
    otra.sprite?.destroy();
    otra.rotulo.destruir();
    otra.globo?.destruir();
    soltarTextura(this.escena, otra.clave);
  }
}

function distancia(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
