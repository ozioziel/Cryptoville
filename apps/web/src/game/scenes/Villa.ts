import {
  AVATAR_INVITADO,
  LISTA_BARRIOS,
  aparienciaDeAvatar,
  aparienciaDeUsuario,
  loteEnSector,
  nombreLugar,
  nombreSector,
  normalizarAparienciaCasa,
  primerLoteLibre,
  reglasDe,
  sectorDeLote,
  type AparienciaPersona,
  type Barrio,
  type Lugar,
  type RedStellar,
} from '@cryptoville/shared';
import Phaser from 'phaser';
import { ALTO_CASA, ANCHO_CASA, COLOR_SE_BUSCA, LETRERO_CASA, colorTextoLetrero, crearCartelSeBusca, crearCasa } from '../../arte/casa';
import { ALTO_LAPIZ, ALTO_LIBRO, ANCHO_LAPIZ, ANCHO_LIBRO, crearLapiz, crearLibroAbierto } from '../../arte/escribir';
import { DUENO_EDIFICIO, crearEdificioPersona, letreroEdificio, pisosEdificio } from '../../arte/edificio';
import { asegurarPersona } from '../animacionPersona';
import { hashTexto, azar } from '../../arte/svg';
import {
  ALTO_ARBOL,
  ALTO_FAROL,
  ALTO_LETRERO_SECTOR,
  ANCHO_ARBOL,
  ANCHO_FAROL,
  ANCHO_LETRERO_SECTOR,
  LADO_INSIGNIA,
  PUERTA_TABLON,
  TABLON,
  TEMAS,
  crearArbol,
  crearCalle,
  crearFarol,
  crearInsignia,
  crearLetreroSector,
  crearLoteDisponible,
  crearMarca,
  crearTablon,
  edificioCentral,
  estatua,
  type PiezaGrande,
  type TemaVilla,
} from '../../arte/villa';
import { emitir, escuchar, type EdificioEnMapa, type LocalEnMapa, type ModoVilla, type PersonaEnLinea, type Puerta, type SeBuscaEnMapa } from '../EventBus';
import { ALTO_JUGADOR, ANCHO_JUGADOR, Jugador } from '../objects/Jugador';
import { PersonasEnVilla } from '../objects/Personas';
import * as plano from '../plano';
import { asegurarTextura, marcarPermanente, soltarTextura, texto, usarTextura } from '../texturas';
import { resolucionTexturas, zoomVilla } from '../zoom';

const DISTANCIA_PUERTA = 34;
const DISTANCIA_EDIFICIO = 44;
const DISTANCIA_LETRERO = 52;
/** Se dibuja lo que está a esta distancia de la cámara; se borra lo que queda más lejos que MARGEN_SALIDA. */
const MARGEN_VISTA = 320;
const MARGEN_SALIDA = 760;
const DX = plano.DESPLAZAMIENTO_PLAZA;

/**
 * Lo que se dibuja en un lote: un local (modo contratar), el cartel de un «Se busca» (modo trabajar)
 * o, en la Plaza principal, el edificio de una persona (su CV).
 */
type CasaDeVilla = LocalEnMapa & {
  busquedaId?: string;
  presupuesto?: string | null;
  /** Edificio de la Plaza: de quién es, si verificó su identidad y cuántos pisos tiene. */
  usuarioId?: string;
  verificado?: boolean;
  pisos?: number;
};

/** Un «Se busca» se dibuja como un cartel de aviso en su lote (ver `crearCartelSeBusca`). */
const casaDeSeBusca = (b: SeBuscaEnMapa): CasaDeVilla => ({
  id: b.id,
  busquedaId: b.id,
  presupuesto: b.presupuesto ?? null,
  barrio: b.barrio,
  lote: b.lote,
  nombre: b.titulo,
  color: COLOR_SE_BUSCA,
  avatarDueno: b.avatarAutor,
  aparienciaDueno: b.aparienciaAutor ?? null,
  aparienciaCasa: null,
});

/** En la Plaza cada persona con locales tiene un edificio en su lote (`usuarios.lote_plaza`). */
const casaDeEdificio = (e: EdificioEnMapa): CasaDeVilla => ({
  id: e.usuarioId,
  usuarioId: e.usuarioId,
  verificado: e.verificado,
  pisos: pisosEdificio(e.locales),
  lote: e.lote,
  nombre: e.nombre,
  color: '#5f6f86',
  avatarDueno: e.avatar,
  aparienciaDueno: e.apariencia ?? null,
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
  /** Lote frente al que aparece el jugador (desde el buscador), contando todos los sectores. */
  destino?: number | null;
  /** Posición exacta (al reconstruir la escena por un cambio de resolución). */
  posicion?: { x: number; y: number } | null;
  /** Sector de la villa (1 = el primero, 2 = «B»…). Si falta, el del destino o el primero. */
  sector?: number;
}

/**
 * Una villa: su propio mapa, que crece en filas a medida que se abren locales.
 * En el modo «Quiero trabajar» el mismo mapa muestra una casa por cada «Se busca» abierto.
 *
 * La Plaza principal usa esta misma escena con su propio arte (`barrio` = 'plaza'): en cada lote, el edificio
 * de una persona con locales (su CV). Solo existe en «Quiero contratar»: al pasar a «Quiero trabajar» se va
 * a la primera villa.
 *
 * Sectores: cada 60 casas (la entrada más 8 calles) se abre otro sector, «Creativo B», «Creativo C»…
 * El sector sale del número de lote, así las casas nunca cambian de lugar. Solo se dibuja el sector
 * donde está el jugador; se pasa con el letrero del final de la última calle o desde el selector de villas.
 */
export class Villa extends Phaser.Scene {
  /** La villa (o la Plaza) de esta escena. */
  readonly barrio: Lugar;
  private tema: TemaVilla;
  private jugador!: Jugador;
  /** El libro y el lápiz del jugador mientras «Mis pedidos» está abierto. */
  private escritura: Phaser.GameObjects.Image[] = [];
  private teclas!: Record<'arriba' | 'abajo' | 'izq' | 'der' | 'w' | 'a' | 's' | 'd' | 'entrar' | 'entrar2' | 'hablar', Phaser.Input.Keyboard.Key>;
  /** Las otras personas en línea, los nombres sobre las cabezas y los globos del chat. */
  private personas!: PersonasEnVilla;
  private personaCercana: PersonaEnLinea | null = null;
  private ultimaPosicion = { x: -1, y: -1, t: 0 };
  private cadaPosicion = 125;
  private joystick = new Phaser.Math.Vector2(0, 0);
  private controlesActivos = true;
  private desuscribir: (() => void)[] = [];
  private datos: DatosVilla = {};

  /** Casas del sector, por su lote dentro del sector (1–60). Cada casa conserva su lote de la villa. */
  private locales = new Map<number, CasaDeVilla>();
  private modo: ModoVilla = 'contratar';
  /** Lote disponible dentro del sector (0 si el primer lote libre de la villa está en otro sector). */
  private loteLibre = 1;
  /** Primer lote libre de la villa (contando todos los sectores). */
  private loteLibreVilla = 1;
  private sector = 1;
  private totalSectores = 1;
  private letreros: Phaser.GameObjects.GameObject[] = [];
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

  constructor(barrio: Lugar) {
    super(`villa-${barrio}`);
    this.barrio = barrio;
    this.tema = TEMAS[barrio];
  }

  init(datos: DatosVilla): void {
    this.datos = datos ?? {};
    this.sector = Math.max(1, Math.floor(this.datos.sector ?? (this.datos.destino ? sectorDeLote(this.datos.destino) : 1)));
    this.letreros = [];
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
    // La Plaza solo existe en «Quiero contratar».
    if (this.barrio === 'plaza' && this.modo === 'trabajar') {
      this.scene.start(`villa-${LISTA_BARRIOS[0]}`);
      return;
    }
    this.zoomCss = zoomVilla(this.scale.width / dpr, this.scale.height / dpr);
    this.resolucion = resolucionTexturas(this.zoomCss, dpr);
    this.cameras.main.setBackgroundColor(this.tema.pasto);
    this.obstaculos = this.physics.add.staticGroup();
    this.cambiarFilas(plano.MIN_FILAS);

    this.crearPlaza();

    const destino = this.datos.destino ? plano.puertaDeLote(loteEnSector(this.datos.destino)) : null;
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

    const reglas = reglasDe(((this.registry.get('red') as RedStellar | undefined) ?? 'testnet'));
    this.cadaPosicion = 1000 / reglas.presencia.posicionesPorSegundo;
    this.personaCercana = null;
    this.personas = new PersonasEnVilla(this, {
      resolucion: this.resolucion,
      maxVisibles: reglas.presencia.maxVisibles,
      distancia: reglas.chatCercania.distancia,
      clavePersona: (a) => this.clavePersona(a),
      texturaPersona: (clave, a) => this.texturaPersona(clave, a),
    });
    this.personas.ponerPropio((this.registry.get('yo') as { id: string; nombre: string; verificado: boolean } | null | undefined) ?? null);
    this.personas.actualizarLista((this.registry.get('personas') as PersonaEnLinea[] | undefined) ?? []);

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
      entrar: tecla(K.E), entrar2: tecla(K.ENTER), hablar: tecla(K.H),
    };
    k.disableGlobalCapture();

    this.desuscribir.push(
      escuchar('locales', (locales) => {
        this.registry.set('locales', locales);
        if (this.modo === 'contratar' && this.barrio !== 'plaza') this.recibirLocales(this.casasDelModo());
      }),
      escuchar('se-busca', (busquedas) => {
        this.registry.set('se-busca', busquedas);
        if (this.modo === 'trabajar' && this.barrio !== 'plaza') this.recibirLocales(this.casasDelModo());
      }),
      escuchar('edificios', (edificios) => {
        this.registry.set('edificios', edificios);
        if (this.barrio === 'plaza') this.recibirLocales(this.casasDelModo());
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
      escuchar('escribiendo', (activo) => {
        this.registry.set('escribiendo', activo);
        this.ponerEscritura(activo);
      }),
      escuchar('controles', (activos) => {
        this.controlesActivos = activos;
        if (!activos) this.jugador.mover(0, 0);
      }),
      escuchar('pedir-entrar', () => this.entrar()),
      escuchar('ir-a-lote', (lote) => this.irALote(lote)),
      escuchar('ir-a-local', (destino) => {
        // Si la escena está por reiniciarse (por ejemplo, porque cambió el modo), el destino se cumple al volver.
        if (this.viajando) this.registry.set('destino-pendiente', destino);
        else this.irALocal(destino);
      }),
      escuchar('ir-a-villa', (barrio) => barrio !== this.barrio && this.viajar(barrio, null)),
      escuchar('ir-a-sector', (sector) => this.irASector(sector)),
      escuchar('abrir-interior', (datos) => {
        this.scene.sleep();
        this.scene.launch('Interior', { ...datos, aparienciaJugador: this.aparienciaJugador() });
      }),
      escuchar('cerrar-local', () => this.volverDelInterior()),
      escuchar('yo-en-linea', (datos) => {
        this.registry.set('yo', datos);
        this.personas.ponerPropio(datos);
      }),
      escuchar('personas', (lista) => {
        this.registry.set('personas', lista);
        this.personas.actualizarLista(lista);
      }),
      escuchar('persona-movio', (id, x, y) => this.personas.mover(id, x, y)),
      escuchar('globo', (id, contenido) => this.personas.globo(id, contenido)),
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
      this.personas.destruir();
      // React no debe seguir mostrando "Entrar a …" de una puerta de esta villa (ni "Hablar con …").
      emitir('cerca-de-puerta', null);
      emitir('cerca-de-lote', null);
      emitir('cerca-de-persona', null);
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, limpiar);
    this.events.once(Phaser.Scenes.Events.DESTROY, limpiar);
    this.events.off(Phaser.Scenes.Events.WAKE, this.ajustarZoom, this);
    this.events.on(Phaser.Scenes.Events.WAKE, this.ajustarZoom, this);

    this.recibirLocales(this.casasDelModo());
    camara.fadeIn(320, 253, 246, 227);
    this.registry.set('villa', this.barrio);
    emitir('villa-actual', this.barrio);
    this.anunciarSector();
    emitir('pueblo-listo');
    // Si «Mis pedidos» quedó abierto al cambiar de escena, el jugador sigue escribiendo.
    if (this.registry.get('escribiendo')) this.ponerEscritura(true);
    const pendiente = this.registry.get('destino-pendiente') as { barrio: Barrio; lote: number } | null | undefined;
    if (pendiente) {
      this.registry.set('destino-pendiente', null);
      this.irALocal(pendiente);
    }
  }

  /** El jugador escribe en un libro: libro abierto en las manos y el lápiz que va y viene. */
  private ponerEscritura(activo: boolean): void {
    for (const o of this.escritura) o.destroy();
    this.escritura = [];
    if (!activo || !this.jugador) return;
    const R = this.resolucion;
    const claveLibro = `libro-abierto@${R}`;
    const claveLapiz = `lapiz@${R}`;
    marcarPermanente(claveLibro);
    marcarPermanente(claveLapiz);
    const x = this.jugador.x;
    const y = this.jugador.y - ALTO_JUGADOR * 0.32;
    void Promise.all([
      asegurarTextura(this, claveLibro, (t) => crearLibroAbierto({ tamano: t }), ANCHO_LIBRO, ALTO_LIBRO, R),
      asegurarTextura(this, claveLapiz, (t) => crearLapiz({ tamano: t }), ANCHO_LAPIZ, ALTO_LAPIZ, R),
    ]).then(([okLibro, okLapiz]) => {
      if (!okLibro || !okLapiz || !this.registry.get('escribiendo') || this.escritura.length) return;
      const profundidad = this.jugador.depth + 0.5;
      const libro = this.add.image(x, y, claveLibro).setScale(1 / R).setDepth(profundidad);
      const lapiz = this.add.image(x + 4, y - 6, claveLapiz).setOrigin(0.15, 0.85).setScale(1 / R).setDepth(profundidad + 0.1);
      // Va y viene sobre la hoja, como escribiendo renglones (quieto si la persona pidió menos movimiento).
      if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        this.tweens.add({ targets: lapiz, x: x + 11, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
        this.tweens.add({ targets: lapiz, angle: { from: -6, to: 6 }, duration: 210, yoyo: true, repeat: -1 });
      }
      this.escritura = [libro, lapiz];
    });
  }

  private irALocal({ barrio, lote }: { barrio: Lugar; lote: number }): void {
    if (barrio === this.barrio) this.irALote(lote);
    else this.viajar(barrio, lote);
  }

  update(tiempo: number, delta: number): void {
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
      if (Phaser.Input.Keyboard.JustDown(t.hablar) && this.personaCercana) emitir('hablar-con', this.personaCercana.id);
    }

    // Personas en línea: posiciones interpoladas, nombres, globos y quién está cerca para hablar.
    const gente = this.personas.actualizar(this.jugador, tiempo, delta);
    if (gente.cambio) {
      this.personaCercana = gente.cercana;
      emitir('cerca-de-persona', gente.cercana ? { id: gente.cercana.id, nombre: gente.cercana.nombre } : null);
    }
    // La posición propia sale como mucho 8 veces por segundo, y solo si se movió (o cada 4 s, para seguir a la vista).
    if (tiempo - this.ultimaPosicion.t >= this.cadaPosicion) {
      const x = Math.round(this.jugador.x);
      const y = Math.round(this.jugador.y);
      if (x !== this.ultimaPosicion.x || y !== this.ultimaPosicion.y || tiempo - this.ultimaPosicion.t > 4000) {
        this.ultimaPosicion = { x, y, t: tiempo };
        emitir('mi-posicion', x, y);
      }
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
        this.marcaY = cercana.y - (puerta?.tipo === 'edificio' ? 118 : puerta?.tipo === 'tablon' ? 158 : puerta?.tipo === 'lote-libre' ? 150 : 140);
        this.marca.setPosition(cercana.x, this.marcaY).setVisible(true);
      } else this.marca.setVisible(false);
      emitir('cerca-de-puerta', puerta);
      emitir('cerca-de-lote', puerta && this.modo === 'contratar' && (puerta.tipo === 'local' || puerta.tipo === 'lote-libre') ? puerta.lote : null);
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
    if (this.barrio === 'plaza') return ((this.registry.get('edificios') as EdificioEnMapa[] | undefined) ?? []).map(casaDeEdificio);
    if (this.modo === 'trabajar') return ((this.registry.get('se-busca') as SeBuscaEnMapa[] | undefined) ?? []).map(casaDeSeBusca);
    return (this.registry.get('locales') as LocalEnMapa[] | undefined) ?? [];
  }

  /** Al cambiar de modo la villa se vuelve a armar con las otras casas (mismo lugar y mismo diseño). */
  private cambiarModo(): void {
    // Si ya está viajando, la escena que viene lee el modo nuevo del registro.
    if (this.viajando) return;
    // La Plaza no tiene «Se busca»: en «Quiero trabajar» se va a la primera villa.
    if (this.barrio === 'plaza') {
      if ((this.registry.get('modo') as ModoVilla | undefined) === 'trabajar') this.viajar(LISTA_BARRIOS[0], null);
      return;
    }
    this.despertar();
    this.viajando = true;
    this.cameras.main.fadeOut(180, 253, 246, 227);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.restart({ posicion: { x: this.jugador.x, y: this.jugador.y }, sector: this.sector } satisfies DatosVilla);
    });
  }

  private recibirLocales(todos: CasaDeVilla[]): void {
    // En la Plaza todos los edificios son de la Plaza (no tienen villa).
    const deLaVilla = this.barrio === 'plaza' ? todos : todos.filter((l) => l.barrio === this.barrio);
    const lotes = deLaVilla.map((l) => l.lote);
    this.loteLibreVilla = primerLoteLibre(lotes);
    const total = Math.max(1, sectorDeLote(this.loteLibreVilla), ...lotes.map((l) => sectorDeLote(l)));
    const sectorAntes = this.sector;
    // Si en este modo hay menos sectores (por ejemplo, al pasar a «Quiero trabajar»), se queda en el último.
    this.sector = Math.min(this.sector, total);
    if (total !== this.totalSectores || sectorAntes !== this.sector) {
      this.totalSectores = total;
      this.anunciarSector();
    }
    this.locales = new Map(deLaVilla.filter((l) => sectorDeLote(l.lote) === this.sector).map((l) => [loteEnSector(l.lote), l]));
    // En la Plaza no hay lotes disponibles: los edificios se asignan solos al abrir el primer local.
    this.loteLibre = this.barrio !== 'plaza' && sectorDeLote(this.loteLibreVilla) === this.sector ? loteEnSector(this.loteLibreVilla) : 0;
    // Un sector que ya se llenó muestra todas sus calles (y al final, el letrero al siguiente).
    const filas =
      this.sector < this.totalSectores ? plano.FILAS_POR_SECTOR : plano.filasNecesarias([...this.locales.keys(), ...(this.loteLibre ? [this.loteLibre] : [])]);
    if (filas !== this.filas) this.cambiarFilas(filas);

    this.puertas = [];
    for (const [lote, casa] of this.locales) {
      const p = plano.puertaDeLote(lote);
      // La puerta lleva el lote de la villa (así React encuentra el local o el «Se busca»).
      const puerta: Puerta = casa.usuarioId
        ? { tipo: 'persona', barrio: this.barrio, lote: casa.lote, usuarioId: casa.usuarioId }
        : casa.busquedaId
          ? { tipo: 'se-busca', barrio: this.barrio, lote: casa.lote, busquedaId: casa.busquedaId }
          : { tipo: 'local', barrio: this.barrio, lote: casa.lote };
      this.puertas.push({ puerta, ...p, distancia: DISTANCIA_PUERTA });
    }
    if (this.loteLibre) {
      const libre = plano.frenteDeLote(this.loteLibre);
      this.puertas.push({ puerta: { tipo: 'lote-libre', barrio: this.barrio, lote: this.loteLibreVilla }, ...libre, distancia: DISTANCIA_PUERTA });
    }
    this.crearLetreros();
    const edificio = edificioCentral(this.barrio);
    this.puertas.push({
      puerta: { tipo: 'edificio', barrio: this.barrio, lote: null },
      x: edificio.puerta.x + DX,
      y: edificio.puerta.y,
      distancia: DISTANCIA_EDIFICIO,
    });
    // El tablón de afiches (la búsqueda), en los dos modos.
    this.puertas.push({ puerta: { tipo: 'tablon', barrio: this.barrio, lote: null }, x: PUERTA_TABLON.x + DX, y: PUERTA_TABLON.y, distancia: DISTANCIA_EDIFICIO });
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

  /** Letreros a los sectores vecinos: «Creativo B →» al final de la última calle y «← Creativo» al empezar la primera. */
  private crearLetreros(): void {
    this.letreros.forEach((o) => (o instanceof Phaser.GameObjects.Zone ? this.obstaculos.remove(o, true, true) : o.destroy()));
    this.letreros = [];
    const R = this.resolucion;
    const nombreVilla = nombreLugar(this.barrio);
    const poner = (direccion: 'siguiente' | 'anterior', sector: number, fila: number) => {
      const calle = plano.calleDeFila(fila);
      const x = direccion === 'siguiente' ? plano.ANCHO_VILLA - ANCHO_LETRERO_SECTOR - 6 : 6;
      const y = calle.y + 4;
      const clave = `letrero-sector-${direccion}@${R}`;
      const lista = this.letreros;
      marcarPermanente(clave);
      void asegurarTextura(this, clave, (t) => crearLetreroSector(direccion, t), ANCHO_LETRERO_SECTOR, ALTO_LETRERO_SECTOR, R).then((ok) => {
        if (!ok || this.letreros !== lista) return;
        lista.push(this.add.image(x, y, clave).setOrigin(0).setScale(1 / R).setDepth(y + ALTO_LETRERO_SECTOR));
      });
      const centro = x + (direccion === 'siguiente' ? 58 : 78);
      const rotulo = texto(this, centro, y + 25, nombreSector(nombreVilla, sector), { tamano: 12, peso: 800, color: '#3b2a25' }, R * 1.5);
      rotulo.setDepth(y + ALTO_LETRERO_SECTOR + 0.5);
      ajustarTexto(rotulo, nombreSector(nombreVilla, sector), 96);
      lista.push(rotulo, this.solido(x + 63, y + 58, 10, 10));
      this.puertas.push({
        puerta: { tipo: 'sector', barrio: this.barrio, lote: null, sector },
        x: x + ANCHO_LETRERO_SECTOR / 2,
        y: y + ALTO_LETRERO_SECTOR + 12,
        distancia: DISTANCIA_LETRERO,
      });
    };
    if (this.sector < this.totalSectores) poner('siguiente', this.sector + 1, this.filas - 1);
    if (this.sector > 1) poner('anterior', this.sector - 1, 0);
  }

  private anunciarSector(): void {
    this.registry.set('sector', this.sector);
    emitir('sector-actual', { barrio: this.barrio, sector: this.sector, total: this.totalSectores });
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
    if (l) {
      return JSON.stringify([l.busquedaId ?? null, l.usuarioId ?? null, l.verificado ?? null, l.pisos ?? null, l.nombre, l.presupuesto ?? null, l.color, l.aparienciaCasa ?? null, l.aparienciaDueno ?? null, l.avatarDueno]);
    }
    return lote === this.loteLibre ? 'libre' : 'vacio';
  }

  private firmaFila(fila: number): string {
    return plano.lotesDeFila(fila).map((l) => (this.locales.has(l) ? 'o' : l === this.loteLibre ? 'l' : '-')).join('');
  }

  private aparienciaJugador(): AparienciaPersona {
    const guardada = this.registry.get('apariencia') as AparienciaPersona | null | undefined;
    if (guardada) return guardada;
    const avatar = this.registry.get('avatar') as number | undefined;
    return aparienciaDeAvatar(avatar ?? AVATAR_INVITADO);
  }

  // ---------------------------------------------------------------
  // Dibujo
  // ---------------------------------------------------------------

  private dpr(): number {
    return (this.registry.get('dpr') as number | undefined) ?? 1;
  }

  private clavePersona(a: AparienciaPersona): string {
    return `persona-perfiles:${hashTexto(JSON.stringify(a))}@${this.resolucion}`;
  }

  private texturaPersona(clave: string, a: AparienciaPersona): Promise<boolean> {
    return asegurarPersona(this, clave, a, ANCHO_JUGADOR, ALTO_JUGADOR, this.resolucion);
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

    // El tercer farol le dejó su lugar al tablón de afiches.
    for (const x of [200, 560]) {
      this.pieza(`farol-${b}`, (t) => crearFarol(b, t), ANCHO_FAROL, ALTO_FAROL, x + DX, 346, 426);
      this.solido(x + DX + 6, 416, 12, 10);
    }
    this.pieza(`tablon-${b}`, (t) => crearTablon(b, t), TABLON.ancho, TABLON.alto, TABLON.x + DX, TABLON.y, TABLON.y + TABLON.alto);
    this.solido(TABLON.x + DX + 14, TABLON.y + TABLON.alto - 14, TABLON.ancho - 28, 10);

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
        // Cada modo ofrece lo de su rol: quien trabaja abre su local; quien contrata publica lo que necesita.
        texto(this, p.x + 75, p.y + 108, this.modo === 'trabajar' ? 'Abre tu local' : 'Publica lo que necesitas', { tamano: 11, peso: 600, color: '#7a6a5f' }, R * 1.5).setDepth(2),
      );
      return;
    }

    if (local.usuarioId) {
      this.dibujarEdificio(lote, p, local, casa, vigente);
      return;
    }
    const seBusca = !!local.busquedaId;
    if (seBusca) {
      this.dibujarCartelSeBusca(lote, p, local, casa, vigente);
      return;
    }
    // Las casas de los locales solo están en las villas (en la Plaza van los edificios).
    const villa = this.barrio as Barrio;
    casa.objetos.push(this.solido(p.x + 4, p.y + 8, ANCHO_CASA - 8, ALTO_CASA - 14));
    const aparienciaCasa = normalizarAparienciaCasa(villa, local.aparienciaCasa);
    const claveCasa = `casa:${villa}:${seBusca ? 'se-busca:' : ''}${hashTexto(JSON.stringify([local.color, aparienciaCasa]))}@${R}`;
    casa.texturas.push(claveCasa);
    usarTextura(claveCasa);
    void asegurarTextura(this, claveCasa, (t) => crearCasa({ barrio: villa, apariencia: aparienciaCasa, color: local.color, cartelSeBusca: seBusca }, { tamano: t }), ANCHO_CASA, ALTO_CASA, R).then((ok) => {
      if (ok && vigente()) casa.objetos.push(this.add.image(p.x, p.y, claveCasa).setOrigin(0).setScale(1 / R).setDepth(fondo - 1));
    });

    const letrero = texto(this, p.x + LETRERO_CASA.x, p.y + LETRERO_CASA.y, '', { tamano: 12, peso: 700, color: colorTextoLetrero(villa, aparienciaCasa) }, R * 1.5);
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

  /** El edificio de una persona en la Plaza: sus pisos, su nombre (con la ✔ si verificó su identidad) y ella en la vereda. */
  private dibujarEdificio(
    lote: number,
    p: { x: number; y: number },
    e: CasaDeVilla,
    casa: { objetos: Phaser.GameObjects.GameObject[]; texturas: string[] },
    vigente: () => boolean,
  ): void {
    const fondo = p.y + ALTO_CASA;
    const R = this.resolucion;
    casa.objetos.push(this.solido(p.x + 8, p.y + 8, ANCHO_CASA - 16, ALTO_CASA - 14));
    const pisos = e.pisos ?? 2;
    const clave = `edificio:${hashTexto(JSON.stringify([e.usuarioId, pisos]))}@${R}`;
    casa.texturas.push(clave);
    usarTextura(clave);
    void asegurarTextura(this, clave, (t) => crearEdificioPersona({ semilla: e.usuarioId ?? e.nombre, pisos }, { tamano: t }), ANCHO_CASA, ALTO_CASA, R).then((ok) => {
      if (ok && vigente()) casa.objetos.push(this.add.image(p.x, p.y, clave).setOrigin(0).setScale(1 / R).setDepth(fondo - 1));
    });

    // El nombre en la cornisa (arriba: la persona en la vereda no lo tapa); con la ✔, el par queda centrado.
    const conInsignia = !!e.verificado;
    const cartel = letreroEdificio(pisos);
    const letrero = texto(this, p.x + cartel.x, p.y + cartel.y, '', { tamano: 11, peso: 800, color: '#fdf6e3' }, R * 1.5);
    letrero.setDepth(fondo - 0.5);
    ajustarTexto(letrero, e.nombre, cartel.ancho - (conInsignia ? LADO_INSIGNIA + 4 : 0));
    casa.objetos.push(letrero);
    if (conInsignia) {
      const corrida = (LADO_INSIGNIA + 4) / 2;
      letrero.x -= corrida;
      const claveInsignia = `insignia@${R}`;
      marcarPermanente(claveInsignia);
      const x = letrero.x + letrero.width / 2 + 4 + LADO_INSIGNIA / 2;
      void asegurarTextura(this, claveInsignia, (t) => crearInsignia(t), LADO_INSIGNIA, LADO_INSIGNIA, R).then((ok) => {
        if (ok && vigente()) casa.objetos.push(this.add.image(x, p.y + cartel.y, claveInsignia).setScale(1 / R).setDepth(fondo - 0.4));
      });
    }

    const persona = aparienciaDeUsuario({ avatar: e.avatarDueno, apariencia: e.aparienciaDueno });
    const clavePersona = this.clavePersona(persona);
    casa.texturas.push(clavePersona);
    usarTextura(clavePersona);
    void this.texturaPersona(clavePersona, persona).then((ok) => {
      if (!ok || !vigente()) return;
      const sprite = this.add.image(p.x + DUENO_EDIFICIO.x, fondo + 1, clavePersona).setOrigin(0.5, 1).setScale(1 / R).setDepth(fondo + 1);
      this.tweens.add({ targets: sprite, y: sprite.y - 1.5, duration: 700 + (lote % 7) * 53, yoyo: true, repeat: -1 });
      casa.objetos.push(sprite);
    });
  }

  /** El cartel de aviso de un «Se busca», con su autor parado al lado. */
  private dibujarCartelSeBusca(
    lote: number,
    p: { x: number; y: number },
    sb: CasaDeVilla,
    casa: { objetos: Phaser.GameObjects.GameObject[]; texturas: string[] },
    vigente: () => boolean,
  ): void {
    const fondo = p.y + ALTO_CASA;
    const R = this.resolucion;
    // Solo el tablero y los postes estorban el paso: el frente queda libre para acercarse a leer.
    casa.objetos.push(this.solido(p.x + 8, p.y + 10, ANCHO_CASA - 16, 122));
    const villa = this.barrio as Barrio;
    const clave = `cartel-se-busca:${villa}:${hashTexto(JSON.stringify([sb.nombre, sb.presupuesto ?? null]))}@${R}`;
    casa.texturas.push(clave);
    usarTextura(clave);
    void asegurarTextura(this, clave, (t) => crearCartelSeBusca({ barrio: villa, titulo: sb.nombre, presupuesto: sb.presupuesto }, { tamano: t }), ANCHO_CASA, ALTO_CASA, R).then((ok) => {
      if (ok && vigente()) casa.objetos.push(this.add.image(p.x, p.y, clave).setOrigin(0).setScale(1 / R).setDepth(fondo - 1));
    });
    const autor = aparienciaDeUsuario({ avatar: sb.avatarDueno, apariencia: sb.aparienciaDueno });
    const claveAutor = this.clavePersona(autor);
    casa.texturas.push(claveAutor);
    usarTextura(claveAutor);
    void this.texturaPersona(claveAutor, autor).then((ok) => {
      if (!ok || !vigente()) return;
      const sprite = this.add.image(p.x + 136, fondo + 1, claveAutor).setOrigin(0.5, 1).setScale(1 / R).setDepth(fondo + 1);
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
    // Los letreros de sector los resuelve la escena (no abren ningún panel).
    if (p.tipo === 'sector') {
      if (p.sector) this.irASector(p.sector);
      return;
    }
    emitir('entrar-puerta', p);
    if (this.modo === 'contratar' && (p.tipo === 'local' || p.tipo === 'lote-libre') && p.lote !== null) emitir('entrar-lote', p.lote);
  }

  /** Lleva al jugador frente a una casa de esta villa (`lote` cuenta todos los sectores). */
  private irALote(lote: number): void {
    if (sectorDeLote(lote) !== this.sector) {
      this.viajar(this.barrio, lote);
      return;
    }
    this.despertar();
    const enSector = loteEnSector(lote);
    const p = this.locales.has(enSector) ? plano.puertaDeLote(enSector) : plano.frenteDeLote(enSector);
    this.jugador.setPosition(p.x, p.y + 22);
    this.cameras.main.flash(250, 253, 246, 227);
  }

  private irASector(sector: number): void {
    if (sector === this.sector || sector < 1 || sector > this.totalSectores || this.viajando) return;
    this.despertar();
    this.viajando = true;
    this.cameras.main.fadeOut(260, 253, 246, 227);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.restart({ sector } satisfies DatosVilla);
    });
  }

  /** Cambia de villa (o de sector) con una transición suave. */
  private viajar(barrio: Lugar, destino: number | null): void {
    if (this.viajando) return;
    this.despertar();
    this.viajando = true;
    this.cameras.main.fadeOut(260, 253, 246, 227);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(`villa-${barrio}`, { destino, sector: destino ? sectorDeLote(destino) : 1 } satisfies DatosVilla);
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
      this.scene.restart({ posicion: { x: this.jugador.x, y: this.jugador.y }, sector: this.sector } satisfies DatosVilla);
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
  return a === b || (!!a && !!b && a.tipo === b.tipo && a.lote === b.lote && a.barrio === b.barrio && a.sector === b.sector);
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
