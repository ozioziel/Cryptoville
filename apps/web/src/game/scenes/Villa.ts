import {
  aparienciaDeAvatar,
  aparienciaDeUsuario,
  normalizarAparienciaCasa,
  primerLoteLibre,
  type AparienciaPersona,
  type Barrio,
} from '@cryptoville/shared';
import Phaser from 'phaser';
import { ALTO_CASA, ANCHO_CASA, COLOR_SE_BUSCA, LETRERO_CASA, colorTextoLetrero, crearCasa } from '../../arte/casa';
import { crearPersona } from '../../arte/persona';
import { hashTexto, azar } from '../../arte/svg';
import {
  ALTO_ARBOL,
  ALTO_FAROL,
  ANCHO_ARBOL,
  ANCHO_FAROL,
  TEMAS,
  crearArbol,
  crearCalle,
  crearFarol,
  crearLoteDisponible,
  crearMarca,
  edificioCentral,
  estatua,
  type PiezaGrande,
  type TemaVilla,
} from '../../arte/villa';
import { emitir, escuchar, type LocalEnMapa, type ModoVilla, type Puerta, type SeBuscaEnMapa } from '../EventBus';
import { ALTO_JUGADOR, ANCHO_JUGADOR, Jugador } from '../objects/Jugador';
import * as plano from '../plano';
import { asegurarTextura, marcarPermanente, soltarTextura, texto, usarTextura } from '../texturas';
import { resolucionTexturas, zoomVilla } from '../zoom';

const DISTANCIA_PUERTA = 34;
const DISTANCIA_EDIFICIO = 44;
/** Se dibuja lo que está a esta distancia de la cámara; se borra lo que queda más lejos que MARGEN_SALIDA. */
const MARGEN_VISTA = 320;
const MARGEN_SALIDA = 760;
const DX = plano.DESPLAZAMIENTO_PLAZA;

/** Lo que se dibuja como casa: un local (modo contratar) o un «Se busca» (modo trabajar). */
type CasaDeVilla = LocalEnMapa & { busquedaId?: string };

/** Un «Se busca» se dibuja con la casa base de su villa, en mostaza y con su cartel. */
const casaDeSeBusca = (b: SeBuscaEnMapa): CasaDeVilla => ({
  id: b.id,
  busquedaId: b.id,
  barrio: b.barrio,
  lote: b.lote,
  nombre: b.titulo,
  color: COLOR_SE_BUSCA,
  avatarDueno: b.avatarAutor,
  aparienciaDueno: b.aparienciaAutor ?? null,
  aparienciaCasa: null,
});

interface PuertaEnMapa {
  puerta: Puerta;
  x: number;
  y: number;
  distancia: number;
}

interface CasaEnEscena {
  firma: string;
  objetos: Phaser.GameObjects.GameObject[];
  texturas: string[];
}

interface FilaEnEscena {
  firma: string;
  objetos: Phaser.GameObjects.GameObject[];
}

export interface DatosVilla {
  /** Lote frente al que aparece el jugador (desde el buscador). */
  destino?: number | null;
  /** Posición exacta (al reconstruir la escena por un cambio de resolución). */
  posicion?: { x: number; y: number } | null;
}

/**
 * Una villa: su propio mapa, que crece en filas a medida que se abren locales.
 * En el modo «Quiero trabajar» el mismo mapa muestra una casa por cada «Se busca» abierto.
 */
export class Villa extends Phaser.Scene {
  readonly barrio: Barrio;
  private tema: TemaVilla;
  private jugador!: Jugador;
  private teclas!: Record<'arriba' | 'abajo' | 'izq' | 'der' | 'w' | 'a' | 's' | 'd' | 'entrar' | 'entrar2', Phaser.Input.Keyboard.Key>;
  private joystick = new Phaser.Math.Vector2(0, 0);
  private controlesActivos = true;
  private desuscribir: (() => void)[] = [];
  private datos: DatosVilla = {};

  private locales = new Map<number, CasaDeVilla>();
  private modo: ModoVilla = 'contratar';
  private loteLibre = 1;
  private filas = plano.MIN_FILAS;
  private puertas: PuertaEnMapa[] = [];
  private puertaCercana: Puerta | null = null;
  private casas = new Map<number, CasaEnEscena>();
  private filasEnEscena = new Map<number, FilaEnEscena>();
  private obstaculos!: Phaser.Physics.Arcade.StaticGroup;
  private marca!: Phaser.GameObjects.Image;
  private marcaY = 0;
  private resolucion = 1;
  private zoomCss = 1;
  private claveJugador = '';
  private proximaRevision = 0;
  private viajando = false;

  constructor(barrio: Barrio) {
    super(`villa-${barrio}`);
    this.barrio = barrio;
    this.tema = TEMAS[barrio];
  }

  init(datos: DatosVilla): void {
    this.datos = datos ?? {};
    this.locales.clear();
    this.casas.clear();
    this.filasEnEscena.clear();
    this.puertas = [];
    this.puertaCercana = null;
    this.viajando = false;
    this.controlesActivos = true;
  }

  create(): void {
    const dpr = this.dpr();
    this.modo = (this.registry.get('modo') as ModoVilla | undefined) ?? 'contratar';
    this.zoomCss = zoomVilla(this.scale.width / dpr, this.scale.height / dpr);
    this.resolucion = resolucionTexturas(this.zoomCss, dpr);
    this.cameras.main.setBackgroundColor(this.tema.pasto);
    this.obstaculos = this.physics.add.staticGroup();
    this.cambiarFilas(plano.MIN_FILAS);

    this.crearPlaza();

    const destino = this.datos.destino ? plano.puertaDeLote(this.datos.destino) : null;
    const inicio = this.datos.posicion ?? (destino ? { x: destino.x, y: destino.y + 22 } : plano.INICIO);
    this.claveJugador = this.clavePersona(this.aparienciaJugador());
    // La persona del jugador pasa de una villa a otra: su textura no se borra al cambiar de escena.
    marcarPermanente(this.claveJugador);
    usarTextura(this.claveJugador);
    // Mientras se dibuja la persona, el jugador usa una textura vacía.
    this.jugador = new Jugador(this, inicio.x, inicio.y, '__DEFAULT', this.resolucion);
    this.jugador.setVisible(false);
    void this.texturaPersona(this.claveJugador, this.aparienciaJugador()).then((ok) => {
      if (ok && this.jugador?.active) {
        this.jugador.cambiarTextura(this.claveJugador, this.resolucion);
        this.jugador.setVisible(true);
      }
    });
    this.physics.add.collider(this.jugador, this.obstaculos);

    this.marca = this.add.image(0, 0, '__DEFAULT').setVisible(false).setDepth(1e6);
    marcarPermanente(`marca@${this.resolucion}`);
    void asegurarTextura(this, `marca@${this.resolucion}`, (t) => crearMarca(t), 24, 22, this.resolucion).then((ok) => {
      if (ok && this.marca?.active) this.marca.setTexture(`marca@${this.resolucion}`).setScale(1 / this.resolucion);
    });

    const camara = this.cameras.main;
    camara.startFollow(this.jugador, false, 0.15, 0.15);
    this.ajustarZoom();
    this.scale.on('resize', this.alCambiarTamano, this);

    // Teclas sin "capturar": así se puede escribir W, A, S, D o espacios en los formularios.
    const k = this.input.keyboard!;
    const tecla = (codigo: number) => k.addKey(codigo, false);
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.teclas = {
      arriba: tecla(K.UP), abajo: tecla(K.DOWN), izq: tecla(K.LEFT), der: tecla(K.RIGHT),
      w: tecla(K.W), a: tecla(K.A), s: tecla(K.S), d: tecla(K.D),
      entrar: tecla(K.E), entrar2: tecla(K.ENTER),
    };
    k.disableGlobalCapture();

    this.desuscribir.push(
      escuchar('locales', (locales) => {
        this.registry.set('locales', locales);
        if (this.modo === 'contratar') this.recibirLocales(this.casasDelModo());
      }),
      escuchar('se-busca', (busquedas) => {
        this.registry.set('se-busca', busquedas);
        if (this.modo === 'trabajar') this.recibirLocales(this.casasDelModo());
      }),
      escuchar('modo', (modo) => {
        this.registry.set('modo', modo);
        if (modo !== this.modo) this.cambiarModo();
      }),
      escuchar('apariencia', (apariencia) => {
        this.registry.set('apariencia', apariencia);
        this.cambiarPersona(apariencia);
      }),
      escuchar('avatar', (frame) => {
        // Compatibilidad: si todavía no llegó una apariencia, se usa la persona equivalente al personaje.
        this.registry.set('avatar', frame);
        if (!this.registry.get('apariencia')) this.cambiarPersona(aparienciaDeAvatar(frame));
      }),
      escuchar('joystick', (x, y) => this.joystick.set(x, y)),
      escuchar('controles', (activos) => {
        this.controlesActivos = activos;
        if (!activos) this.jugador.mover(0, 0);
      }),
      escuchar('pedir-entrar', () => this.entrar()),
      escuchar('ir-a-lote', (lote) => this.irALote(lote)),
      escuchar('ir-a-local', ({ barrio, lote }) => (barrio === this.barrio ? this.irALote(lote) : this.viajar(barrio, lote))),
      escuchar('ir-a-villa', (barrio) => barrio !== this.barrio && this.viajar(barrio, null)),
      escuchar('abrir-interior', (datos) => {
        this.scene.sleep();
        this.scene.launch('Interior', { ...datos, aparienciaJugador: this.aparienciaJugador() });
      }),
      escuchar('cerrar-local', () => this.volverDelInterior()),
    );
    let limpia = false;
    const limpiar = () => {
      if (limpia) return;
      limpia = true;
      this.desuscribir.forEach((f) => f());
      this.desuscribir = [];
      this.scale.off('resize', this.alCambiarTamano, this);
      this.events.off(Phaser.Scenes.Events.DESTROY, limpiar);
      // Los objetos y las colisiones los borra Phaser al cerrar la escena; aquí solo se liberan las texturas.
      for (const casa of this.casas.values()) casa.texturas.forEach((t) => soltarTextura(this, t));
      this.casas.clear();
      this.filasEnEscena.clear();
      soltarTextura(this, this.claveJugador);
      // React no debe seguir mostrando "Entrar a …" de una puerta de esta villa.
      emitir('cerca-de-puerta', null);
      emitir('cerca-de-lote', null);
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, limpiar);
    this.events.once(Phaser.Scenes.Events.DESTROY, limpiar);
    this.events.off(Phaser.Scenes.Events.WAKE, this.ajustarZoom, this);
    this.events.on(Phaser.Scenes.Events.WAKE, this.ajustarZoom, this);

    this.recibirLocales(this.casasDelModo());
    camara.fadeIn(320, 253, 246, 227);
    this.registry.set('villa', this.barrio);
    emitir('villa-actual', this.barrio);
    emitir('pueblo-listo');
  }

  update(tiempo: number): void {
    if (!this.jugador) return;
    const escribiendo = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? '');
    if (!this.controlesActivos || escribiendo || this.viajando) {
      this.jugador.mover(0, 0);
    } else {
      const t = this.teclas;
      let dx = (t.der.isDown || t.d.isDown ? 1 : 0) - (t.izq.isDown || t.a.isDown ? 1 : 0);
      let dy = (t.abajo.isDown || t.s.isDown ? 1 : 0) - (t.arriba.isDown || t.w.isDown ? 1 : 0);
      if (dx === 0 && dy === 0) {
        dx = this.joystick.x;
        dy = this.joystick.y;
      }
      this.jugador.mover(dx, dy);
      if (Phaser.Input.Keyboard.JustDown(t.entrar) || Phaser.Input.Keyboard.JustDown(t.entrar2)) this.entrar();
    }

    // ¿Está frente a una puerta?
    let cercana: PuertaEnMapa | null = null;
    let mejor = Infinity;
    for (const p of this.puertas) {
      const d = Phaser.Math.Distance.Between(this.jugador.x, this.jugador.y, p.x, p.y);
      if (d < p.distancia && d < mejor) {
        cercana = p;
        mejor = d;
      }
    }
    const puerta = cercana?.puerta ?? null;
    if (!mismaPuerta(puerta, this.puertaCercana)) {
      this.puertaCercana = puerta;
      if (cercana) {
        this.marcaY = cercana.y - (puerta?.tipo === 'edificio' ? 118 : puerta?.tipo === 'lote-libre' ? 150 : 140);
        this.marca.setPosition(cercana.x, this.marcaY).setVisible(true);
      } else this.marca.setVisible(false);
      emitir('cerca-de-puerta', puerta);
      emitir('cerca-de-lote', puerta && this.modo === 'contratar' && puerta.tipo !== 'edificio' ? puerta.lote : null);
    }
    if (this.marca.visible) this.marca.y = this.marcaY - 2 + Math.sin(tiempo / 130) * 2;
    // El jugador se dibuja delante de lo que está más arriba que sus pies y detrás de lo que está más abajo.
    this.jugador.setDepth(this.jugador.y);

    if (tiempo >= this.proximaRevision) {
      this.proximaRevision = tiempo + 200;
      this.actualizarVisibles();
    }
  }

  // ---------------------------------------------------------------
  // Datos
  // ---------------------------------------------------------------

  /** Casas del modo actual: locales («Quiero contratar») o «Se busca» abiertos («Quiero trabajar»). */
  private casasDelModo(): CasaDeVilla[] {
    if (this.modo === 'trabajar') return ((this.registry.get('se-busca') as SeBuscaEnMapa[] | undefined) ?? []).map(casaDeSeBusca);
    return (this.registry.get('locales') as LocalEnMapa[] | undefined) ?? [];
  }

  /** Al cambiar de modo la villa se vuelve a armar con las otras casas (mismo lugar y mismo diseño). */
  private cambiarModo(): void {
    // Si ya está viajando, la escena que viene lee el modo nuevo del registro.
    if (this.viajando) return;
    this.despertar();
    this.viajando = true;
    this.cameras.main.fadeOut(180, 253, 246, 227);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.restart({ posicion: { x: this.jugador.x, y: this.jugador.y } } satisfies DatosVilla);
    });
  }

  private recibirLocales(todos: CasaDeVilla[]): void {
    this.locales = new Map(todos.filter((l) => l.barrio === this.barrio).map((l) => [l.lote, l]));
    this.loteLibre = primerLoteLibre(this.locales.keys());
    const filas = plano.filasNecesarias([...this.locales.keys(), this.loteLibre]);
    if (filas !== this.filas) this.cambiarFilas(filas);

    this.puertas = [];
    for (const [lote, casa] of this.locales) {
      const p = plano.puertaDeLote(lote);
      const puerta: Puerta = casa.busquedaId
        ? { tipo: 'se-busca', barrio: this.barrio, lote, busquedaId: casa.busquedaId }
        : { tipo: 'local', barrio: this.barrio, lote };
      this.puertas.push({ puerta, ...p, distancia: DISTANCIA_PUERTA });
    }
    const libre = plano.frenteDeLote(this.loteLibre);
    this.puertas.push({ puerta: { tipo: 'lote-libre', barrio: this.barrio, lote: this.loteLibre }, ...libre, distancia: DISTANCIA_PUERTA });
    const edificio = edificioCentral(this.barrio);
    this.puertas.push({
      puerta: { tipo: 'edificio', barrio: this.barrio, lote: null },
      x: edificio.puerta.x + DX,
      y: edificio.puerta.y,
      distancia: DISTANCIA_EDIFICIO,
    });
    // Las puertas cambiaron: React deja de mostrar "Entrar a …" hasta que el jugador vuelva a acercarse.
    if (this.puertaCercana) {
      this.puertaCercana = null;
      emitir('cerca-de-puerta', null);
      emitir('cerca-de-lote', null);
    }
    this.marca?.setVisible(false);

    // Las filas donde se abrió o cerró un local se vuelven a armar (cambian los árboles de los lotes vacíos).
    for (const [fila, f] of this.filasEnEscena) if (f.firma !== this.firmaFila(fila)) this.quitarFila(fila);
    // Las casas visibles cuyo dueño, nombre o apariencia cambió se vuelven a dibujar.
    for (const [lote, casa] of this.casas) {
      if (casa.firma !== this.firmaDe(lote)) this.quitarCasa(lote);
    }
    this.actualizarVisibles();
  }

  private cambiarFilas(filas: number): void {
    this.filas = filas;
    const alto = plano.altoVilla(filas);
    this.physics.world.setBounds(0, 0, plano.ANCHO_VILLA, alto);
    this.cameras.main.setBounds(0, 0, plano.ANCHO_VILLA, alto);
    for (const fila of [...this.filasEnEscena.keys()]) if (fila >= filas) this.quitarFila(fila);
  }

  private firmaDe(lote: number): string {
    const l = this.locales.get(lote);
    if (l) return JSON.stringify([l.busquedaId ?? null, l.nombre, l.color, l.aparienciaCasa ?? null, l.aparienciaDueno ?? null, l.avatarDueno]);
    return lote === this.loteLibre ? 'libre' : 'vacio';
  }

  private firmaFila(fila: number): string {
    return plano.lotesDeFila(fila).map((l) => (this.locales.has(l) ? 'o' : l === this.loteLibre ? 'l' : '-')).join('');
  }

  private aparienciaJugador(): AparienciaPersona {
    const guardada = this.registry.get('apariencia') as AparienciaPersona | null | undefined;
    if (guardada) return guardada;
    const avatar = this.registry.get('avatar') as number | undefined;
    return aparienciaDeAvatar(avatar ?? 85);
  }

  // ---------------------------------------------------------------
  // Dibujo
  // ---------------------------------------------------------------

  private dpr(): number {
    return (this.registry.get('dpr') as number | undefined) ?? 1;
  }

  private clavePersona(a: AparienciaPersona): string {
    return `persona:${hashTexto(JSON.stringify(a))}@${this.resolucion}`;
  }

  private texturaPersona(clave: string, a: AparienciaPersona): Promise<boolean> {
    return asegurarTextura(this, clave, (t) => crearPersona(a, { tamano: t }), ANCHO_JUGADOR, ALTO_JUGADOR, this.resolucion);
  }

  private cambiarPersona(a: AparienciaPersona): void {
    const clave = this.clavePersona(a);
    if (clave === this.claveJugador) return;
    const anterior = this.claveJugador;
    this.claveJugador = clave;
    marcarPermanente(clave);
    usarTextura(clave);
    void this.texturaPersona(clave, a).then((ok) => {
      if (ok && this.jugador?.active && this.claveJugador === clave) {
        this.jugador.cambiarTextura(clave, this.resolucion);
        this.jugador.setVisible(true);
      }
      soltarTextura(this, anterior);
    });
  }

  /** Imagen de una pieza permanente (árbol, farol, edificio): se crea cuando su textura está lista. */
  private pieza(clave: string, svg: (t: { ancho: number; alto: number }) => string, ancho: number, alto: number, x: number, y: number, profundidad: number, alListo?: (img: Phaser.GameObjects.Image) => void): void {
    const conResolucion = `${clave}@${this.resolucion}`;
    marcarPermanente(conResolucion);
    void asegurarTextura(this, conResolucion, svg, ancho, alto, this.resolucion).then((ok) => {
      if (!ok || !this.sys.isActive() && !this.sys.isSleeping()) return;
      const img = this.add.image(x, y, conResolucion).setOrigin(0).setScale(1 / this.resolucion).setDepth(profundidad);
      alListo?.(img);
    });
  }

  private solido(x: number, y: number, ancho: number, alto: number): Phaser.GameObjects.Zone {
    const zona = this.add.zone(x + ancho / 2, y + alto / 2, ancho, alto);
    this.physics.add.existing(zona, true);
    this.obstaculos.add(zona);
    return zona;
  }

  /** Entrada de la villa: plaza, edificio central, estatua, faroles y árboles (fijos). */
  private crearPlaza(): void {
    const b = this.barrio;
    const suelo = this.add.graphics().setDepth(0);
    suelo.fillStyle(Phaser.Display.Color.HexStringToColor(this.tema.plaza).color, 1);
    suelo.fillRect(225 + DX, 330, 470, 100);

    const edificio = edificioCentral(b);
    const grande = (p: PiezaGrande, clave: string, profundidad: number, alListo?: (img: Phaser.GameObjects.Image) => void) =>
      this.pieza(clave, p.svg, p.ancho, p.alto, p.x + DX, p.y, profundidad, alListo);
    grande(edificio.frente, `frente-${b}`, 1);
    grande(edificio.cuerpo, `edificio-${b}`, edificio.solido.y + edificio.solido.alto);
    this.solido(edificio.solido.x + DX, edificio.solido.y, edificio.solido.ancho, edificio.solido.alto);
    const profTextos = edificio.solido.y + edificio.solido.alto + 0.5;
    for (const t of edificio.textos) {
      texto(this, t.x + DX, t.y - t.tamano * 0.36, t.texto, t, this.resolucion * 1.5).setDepth(profTextos);
    }
    for (const luz of edificio.luces) {
      const c = this.add.circle(luz.x + DX, luz.y, luz.r, Phaser.Display.Color.HexStringToColor(luz.color).color).setDepth(profTextos);
      this.tweens.add({ targets: c, alpha: 0.25, duration: 500 + ((luz.x * 7) % 700), yoyo: true, repeat: -1, delay: (luz.x * 13) % 600 });
    }

    const e = estatua(b);
    grande(e, `estatua-${b}`, 416);
    this.solido(248 + DX, 300, 104, 114);
    for (const t of e.textos) texto(this, t.x + DX, t.y - t.tamano * 0.36, t.texto, t, this.resolucion * 1.5).setDepth(416.5);

    for (const x of [200, 560, 700]) {
      this.pieza(`farol-${b}`, (t) => crearFarol(b, t), ANCHO_FAROL, ALTO_FAROL, x + DX, 346, 426);
      this.solido(x + DX + 6, 416, 12, 10);
    }

    // Árboles de la entrada: los de la muestra (corridos al centro) y algunos más a los lados.
    const arboles: [number, number][] = [
      [30, 30], [140, 120], [230, 20], [640, 140], [730, 40], [840, 130],
      [-250, 40], [-140, 135], [-40, 25], [930, 30], [1040, 140], [1120, 45],
    ];
    for (const [x, y] of arboles) {
      const ax = x + DX;
      if (ax < 10 || ax > plano.ANCHO_VILLA - 70) continue;
      this.pieza(`arbol-${b}`, (t) => crearArbol(b, t), ANCHO_ARBOL, ALTO_ARBOL, ax, y, y + 64);
      this.solido(ax + 24, y + 56, 12, 8);
    }
  }

  private actualizarVisibles(): void {
    const vista = this.cameras.main.worldView;
    if (!vista.width) return;
    for (let fila = 0; fila < this.filas; fila++) {
      const y0 = fila === 0 ? 0 : plano.topeDeFila(fila) - 30;
      const calle = plano.calleDeFila(fila);
      const y1 = calle.y + calle.alto + 30;
      const visible = y1 >= vista.y - MARGEN_VISTA && y0 <= vista.bottom + MARGEN_VISTA;
      const lejos = y1 < vista.y - MARGEN_SALIDA || y0 > vista.bottom + MARGEN_SALIDA;
      if (visible) {
        if (!this.filasEnEscena.has(fila)) this.crearFila(fila);
        for (const lote of plano.lotesDeFila(fila)) {
          if (!this.casas.has(lote) && (this.locales.has(lote) || lote === this.loteLibre)) this.crearCasa(lote);
        }
      } else if (lejos) {
        this.quitarFila(fila);
        for (const lote of plano.lotesDeFila(fila)) if (this.casas.has(lote)) this.quitarCasa(lote);
      }
    }
  }

  /** Calle de la fila y vegetación de los lotes vacíos. */
  private crearFila(fila: number): void {
    const objetos: Phaser.GameObjects.GameObject[] = [];
    // Las imágenes llegan cuando su textura está lista: si la fila ya se quitó, se descartan.
    const guardar = (o: Phaser.GameObjects.GameObject) => {
      if (this.filasEnEscena.get(fila)?.objetos === objetos) objetos.push(o);
      else o.destroy();
    };
    const calle = plano.calleDeFila(fila);
    // Todas las calles de la villa usan la misma imagen (con tope de resolución: algunos celulares
    // no aceptan texturas de más de 4096 px de ancho).
    const resolucionCalle = Math.min(this.resolucion, 2.5);
    const claveCalle = `calle-${this.barrio}@${resolucionCalle}`;
    marcarPermanente(claveCalle);
    void asegurarTextura(this, claveCalle, (t) => crearCalle(this.barrio, plano.ANCHO_VILLA, calle.alto, t), plano.ANCHO_VILLA, calle.alto, resolucionCalle).then((ok) => {
      if (ok && (this.sys.isActive() || this.sys.isSleeping())) guardar(this.add.image(0, calle.y, claveCalle).setOrigin(0).setScale(1 / resolucionCalle).setDepth(0.5));
    });

    if (fila > 0) {
      const r = azar(hashTexto(`${this.barrio}-${fila}`));
      const tope = plano.topeDeFila(fila);
      // Árboles chicos entre las casas (sin colisión: se puede pasar por detrás).
      for (let c = 0; c < plano.COLUMNAS - 1; c++) {
        if (r() < 0.45) {
          const x = plano.MARGEN_X + c * plano.PASO_COLUMNA + ANCHO_CASA + 2;
          this.pieza(`arbol-${this.barrio}`, (t) => crearArbol(this.barrio, t), 46, 54, x, tope + 54, tope + 104, (img) => guardar(img));
        }
      }
      // Lotes sin casa: un par de árboles para que no quede un hueco vacío.
      for (const lote of plano.lotesDeFila(fila)) {
        if (this.locales.has(lote) || lote === this.loteLibre) continue;
        const p = plano.posicionDeLote(lote);
        const n = r() < 0.5 ? 1 : 2;
        for (let i = 0; i < n; i++) {
          const x = p.x + 18 + i * 64 + Math.floor(r() * 16);
          const y = p.y + 36 + Math.floor(r() * 50);
          this.pieza(`arbol-${this.barrio}`, (t) => crearArbol(this.barrio, t), ANCHO_ARBOL, ALTO_ARBOL, x, y, y + 64, (img) => guardar(img));
          guardar(this.solido(x + 24, y + 56, 12, 8));
        }
      }
    }
    this.filasEnEscena.set(fila, { firma: this.firmaFila(fila), objetos });
  }

  private quitarFila(fila: number): void {
    const f = this.filasEnEscena.get(fila);
    if (!f) return;
    this.filasEnEscena.delete(fila);
    for (const o of f.objetos) {
      if (o instanceof Phaser.GameObjects.Zone) this.obstaculos.remove(o, true, true);
      else o.destroy();
    }
  }

  private crearCasa(lote: number): void {
    const casa: CasaEnEscena = { firma: this.firmaDe(lote), objetos: [], texturas: [] };
    this.casas.set(lote, casa);
    const p = plano.posicionDeLote(lote);
    const fondo = p.y + ALTO_CASA;
    const local = this.locales.get(lote);
    const R = this.resolucion;
    const vigente = () => this.casas.get(lote) === casa;

    if (!local) {
      // Lote disponible, con borde punteado (como en la muestra).
      const clave = `lote-disponible@${R}`;
      marcarPermanente(clave);
      void asegurarTextura(this, clave, (t) => crearLoteDisponible(t), 150, 148, R).then((ok) => {
        if (ok && vigente()) casa.objetos.push(this.add.image(p.x, p.y + 20, clave).setOrigin(0).setScale(1 / R).setDepth(1));
      });
      casa.objetos.push(
        texto(this, p.x + 75, p.y + 90, 'Lote disponible', { tamano: 12, peso: 700, color: '#3b2a25' }, R * 1.5).setDepth(2),
        texto(this, p.x + 75, p.y + 108, this.modo === 'trabajar' ? 'Publica lo que necesitas' : 'Abre tu local aquí', { tamano: 11, peso: 600, color: '#7a6a5f' }, R * 1.5).setDepth(2),
      );
      return;
    }

    casa.objetos.push(this.solido(p.x + 4, p.y + 8, ANCHO_CASA - 8, ALTO_CASA - 14));
    const aparienciaCasa = normalizarAparienciaCasa(this.barrio, local.aparienciaCasa);
    const seBusca = !!local.busquedaId;
    const claveCasa = `casa:${this.barrio}:${seBusca ? 'se-busca:' : ''}${hashTexto(JSON.stringify([local.color, aparienciaCasa]))}@${R}`;
    casa.texturas.push(claveCasa);
    usarTextura(claveCasa);
    void asegurarTextura(this, claveCasa, (t) => crearCasa({ barrio: this.barrio, apariencia: aparienciaCasa, color: local.color, cartelSeBusca: seBusca }, { tamano: t }), ANCHO_CASA, ALTO_CASA, R).then((ok) => {
      if (ok && vigente()) casa.objetos.push(this.add.image(p.x, p.y, claveCasa).setOrigin(0).setScale(1 / R).setDepth(fondo - 1));
    });

    const letrero = texto(this, p.x + LETRERO_CASA.x, p.y + LETRERO_CASA.y, '', { tamano: 12, peso: 700, color: colorTextoLetrero(this.barrio, aparienciaCasa) }, R * 1.5);
    letrero.setDepth(fondo - 0.5);
    ajustarTexto(letrero, local.nombre, LETRERO_CASA.ancho);
    casa.objetos.push(letrero);

    // El dueño espera en la puerta, como la vecina de la muestra.
    const dueno = aparienciaDeUsuario({ avatar: local.avatarDueno, apariencia: local.aparienciaDueno });
    const claveDueno = this.clavePersona(dueno);
    casa.texturas.push(claveDueno);
    usarTextura(claveDueno);
    void this.texturaPersona(claveDueno, dueno).then((ok) => {
      if (!ok || !vigente()) return;
      const sprite = this.add.image(p.x + 110, fondo + 1, claveDueno).setOrigin(0.5, 1).setScale(1 / R).setDepth(fondo + 1);
      this.tweens.add({ targets: sprite, y: sprite.y - 1.5, duration: 700 + (lote % 7) * 53, yoyo: true, repeat: -1 });
      casa.objetos.push(sprite);
    });
  }

  private quitarCasa(lote: number): void {
    const casa = this.casas.get(lote);
    if (!casa) return;
    this.casas.delete(lote);
    for (const o of casa.objetos) {
      if (o instanceof Phaser.GameObjects.Zone) this.obstaculos.remove(o, true, true);
      else o.destroy();
    }
    for (const t of casa.texturas) soltarTextura(this, t);
  }

  // ---------------------------------------------------------------
  // Movimiento entre villas y lotes
  // ---------------------------------------------------------------

  private entrar(): void {
    const p = this.puertaCercana;
    if (!p || !this.controlesActivos || this.viajando) return;
    emitir('entrar-puerta', p);
    if (this.modo === 'contratar' && p.tipo !== 'edificio' && p.lote !== null) emitir('entrar-lote', p.lote);
  }

  private irALote(lote: number): void {
    this.despertar();
    const p = this.locales.has(lote) ? plano.puertaDeLote(lote) : plano.frenteDeLote(lote);
    this.jugador.setPosition(p.x, p.y + 22);
    this.cameras.main.flash(250, 253, 246, 227);
  }

  /** Cambia de villa con una transición suave. */
  private viajar(barrio: Barrio, destino: number | null): void {
    if (this.viajando) return;
    this.despertar();
    this.viajando = true;
    this.cameras.main.fadeOut(260, 253, 246, 227);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(`villa-${barrio}`, { destino } satisfies DatosVilla);
    });
  }

  /** Si el interior de un local está abierto, se cierra antes de moverse. */
  private despertar(): void {
    if (this.scene.isActive('Interior') || this.scene.isPaused('Interior')) this.scene.stop('Interior');
    if (this.scene.isSleeping()) this.scene.wake();
  }

  private volverDelInterior(): void {
    this.despertar();
    // Un paso hacia la calle para no volver a entrar sin querer.
    this.jugador.y += 8;
  }

  private alCambiarTamano(): void {
    const dpr = this.dpr();
    const zoom = zoomVilla(this.scale.width / dpr, this.scale.height / dpr);
    const resolucion = resolucionTexturas(zoom, dpr);
    if (resolucion > this.resolucion && this.sys.isActive()) {
      // Pantalla más grande o más densa: se vuelve a dibujar todo con más resolución.
      this.scene.restart({ posicion: { x: this.jugador.x, y: this.jugador.y } } satisfies DatosVilla);
      return;
    }
    this.ajustarZoom();
  }

  private ajustarZoom(): void {
    const dpr = this.dpr();
    this.zoomCss = zoomVilla(this.scale.width / dpr, this.scale.height / dpr);
    this.cameras.main.setZoom(this.zoomCss * dpr);
  }
}

function mismaPuerta(a: Puerta | null, b: Puerta | null): boolean {
  return a === b || (!!a && !!b && a.tipo === b.tipo && a.lote === b.lote && a.barrio === b.barrio);
}

/** Recorta el texto con "…" hasta que entre en el ancho. */
function ajustarTexto(t: Phaser.GameObjects.Text, contenido: string, ancho: number): void {
  let actual = contenido;
  t.setText(actual);
  while (t.width > ancho && actual.length > 3) {
    actual = actual.slice(0, -1);
    t.setText(`${actual.trimEnd()}…`);
  }
}
