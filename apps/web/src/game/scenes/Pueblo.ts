import Phaser from 'phaser';
import { emitir, escuchar, type LocalEnMapa } from '../EventBus';
import { Jugador } from '../objects/Jugador';
import { FUENTE_PIXEL, Letrero } from '../objects/Letrero';
import { zoomPara } from '../zoom';

interface Lote {
  lote: number;
  barrio: string;
  puerta: Phaser.Math.Vector2;
  letrero: Letrero;
  dueno?: Phaser.GameObjects.Sprite;
  marca: Phaser.GameObjects.Text;
}

const DISTANCIA_PUERTA = 14;

/**
 * El pueblo: mapa de Tiled con 3 barrios y 12 lotes (gráficos de Kenney).
 * @deprecated Reemplazado por las villas en vectores (scenes/Villa.ts). Ya no se registra en el juego;
 * se conserva sin borrar, junto con el mapa (public/assets/mapas/pueblo.json) y los gráficos de Kenney.
 */
export class Pueblo extends Phaser.Scene {
  private jugador!: Jugador;
  private teclas!: Record<'arriba' | 'abajo' | 'izq' | 'der' | 'w' | 'a' | 's' | 'd' | 'entrar' | 'entrar2', Phaser.Input.Keyboard.Key>;
  private lotes: Lote[] = [];
  private loteCercano: number | null = null;
  private joystick = new Phaser.Math.Vector2(0, 0);
  private controlesActivos = true;
  private desuscribir: (() => void)[] = [];
  private avatarInicial = 85;

  constructor() {
    super('Pueblo');
  }

  create(): void {
    const mapa = this.make.tilemap({ key: 'pueblo' });
    const tiles = mapa.addTilesetImage('tiny-town', 'tiny-town');
    if (!tiles) throw new Error('No se encontró el tileset del pueblo');
    mapa.createLayer('suelo', tiles, 0, 0);
    mapa.createLayer('caminos', tiles, 0, 0);
    const edificios = mapa.createLayer('edificios', tiles, 0, 0);
    if (!edificios) throw new Error('El mapa no tiene la capa "edificios"');
    edificios.setCollisionByProperty({ colisiona: true });

    this.physics.world.setBounds(0, 0, mapa.widthInPixels, mapa.heightInPixels);

    const objetos = mapa.getObjectLayer('objetos')?.objects ?? [];
    const propiedad = (o: Phaser.Types.Tilemaps.TiledObject, nombre: string) =>
      (o.properties as { name: string; value: unknown }[] | undefined)?.find((p) => p.name === nombre)?.value;

    for (const o of objetos) {
      if (o.type === 'lote') {
        const puerta = new Phaser.Math.Vector2(Number(propiedad(o, 'puertaX')) * 16 + 8, Number(propiedad(o, 'puertaY')) * 16 + 16);
        const letrero = new Letrero(this, (o.x ?? 0) + 24, (o.y ?? 0) - 5);
        letrero.mostrar('Se alquila', null);
        const marca = this.add
          .text(puerta.x, puerta.y - 26, '▼', { fontFamily: FUENTE_PIXEL, fontSize: '32px', color: '#fdf6e3', stroke: '#3b2a25', strokeThickness: 6 })
          .setOrigin(0.5)
          .setScale(0.25)
          .setDepth(30)
          .setVisible(false);
        this.tweens.add({ targets: marca, y: marca.y - 3, duration: 400, yoyo: true, repeat: -1 });
        this.lotes.push({ lote: Number(propiedad(o, 'lote')), barrio: String(propiedad(o, 'barrio')), puerta, letrero, marca });
      } else if (o.type === 'barrio') {
        this.add
          .text(o.x ?? 0, o.y ?? 0, String(propiedad(o, 'texto') ?? ''), {
            fontFamily: FUENTE_PIXEL,
            fontSize: '40px',
            color: '#fdf6e3',
            stroke: '#3b2a25',
            strokeThickness: 8,
          })
          .setOrigin(0.5)
          .setScale(0.25)
          .setDepth(25);
      }
    }

    const inicio = objetos.find((o) => o.type === 'inicio');
    this.jugador = new Jugador(this, inicio?.x ?? 384, inicio?.y ?? 272, 'personajes', 1);
    this.jugador.setFrame(this.avatarInicial);
    this.physics.add.collider(this.jugador, edificios);

    const camara = this.cameras.main;
    camara.setBounds(0, 0, mapa.widthInPixels, mapa.heightInPixels);
    camara.startFollow(this.jugador, true, 0.15, 0.15);
    camara.setRoundPixels(true);
    this.ajustarZoom();
    this.scale.on('resize', this.ajustarZoom, this);

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
      escuchar('locales', (locales) => this.pintarLocales(locales)),
      escuchar('avatar', (frame) => {
        this.avatarInicial = frame;
        this.jugador?.setFrame(frame);
      }),
      escuchar('joystick', (x, y) => this.joystick.set(x, y)),
      escuchar('controles', (activos) => {
        this.controlesActivos = activos;
        if (!activos) this.jugador.mover(0, 0);
      }),
      escuchar('pedir-entrar', () => this.entrar()),
      escuchar('ir-a-lote', (lote) => this.irALote(lote)),
      escuchar('abrir-interior', (datos) => this.abrirInterior(datos)),
      escuchar('cerrar-local', () => this.volverDelInterior()),
    );
    const limpiar = () => {
      this.desuscribir.forEach((f) => f());
      this.desuscribir = [];
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, limpiar);
    this.events.once(Phaser.Scenes.Events.DESTROY, limpiar);
    this.events.on(Phaser.Scenes.Events.WAKE, () => this.ajustarZoom());

    emitir('pueblo-listo');
  }

  update(): void {
    if (!this.jugador) return;
    const escribiendo = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? '');
    if (!this.controlesActivos || escribiendo) {
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
    let cercano: Lote | null = null;
    for (const l of this.lotes) {
      const d = Phaser.Math.Distance.Between(this.jugador.x, this.jugador.y, l.puerta.x, l.puerta.y + 6);
      if (d < DISTANCIA_PUERTA && (!cercano || d < Phaser.Math.Distance.Between(this.jugador.x, this.jugador.y, cercano.puerta.x, cercano.puerta.y + 6))) {
        cercano = l;
      }
    }
    const lote = cercano?.lote ?? null;
    if (lote !== this.loteCercano) {
      this.lotes.forEach((l) => l.marca.setVisible(l.lote === lote));
      this.loteCercano = lote;
      emitir('cerca-de-lote', lote);
    }
    // Profundidad: el jugador se dibuja detrás de los letreros pero delante del suelo.
    this.jugador.setDepth(10 + this.jugador.y / 1000);
  }

  private entrar(): void {
    if (this.loteCercano !== null && this.controlesActivos) emitir('entrar-lote', this.loteCercano);
  }

  /** Abre el interior del local (React lo pide por el EventBus cuando el lote tiene dueño). */
  private abrirInterior(datos: { nombre: string; avatarDueno: number }): void {
    this.scene.sleep();
    this.scene.launch('Interior', { ...datos, avatarJugador: Number(this.jugador.frame.name) });
  }

  private volverDelInterior(): void {
    if (this.scene.isActive('Interior') || this.scene.isPaused('Interior')) this.scene.stop('Interior');
    if (this.scene.isSleeping()) this.scene.wake();
    // Un paso hacia la calle para no volver a entrar sin querer.
    this.jugador.y += 4;
  }

  private irALote(lote: number): void {
    const l = this.lotes.find((x) => x.lote === lote);
    if (!l) return;
    this.jugador.setPosition(l.puerta.x, l.puerta.y + 8);
    this.cameras.main.flash(250, 253, 246, 227);
  }

  private pintarLocales(locales: LocalEnMapa[]): void {
    for (const l of this.lotes) {
      const local = locales.find((x) => x.lote === l.lote);
      l.letrero.mostrar(local?.nombre ?? 'Se alquila', local?.color ?? null);
      if (local) {
        if (!l.dueno) {
          l.dueno = this.add.sprite(l.puerta.x + 15, l.puerta.y + 2, 'personajes', local.avatarDueno).setOrigin(0.5, 1).setDepth(9);
          this.tweens.add({ targets: l.dueno, y: l.dueno.y - 1, duration: 700 + l.lote * 37, yoyo: true, repeat: -1 });
        } else {
          l.dueno.setFrame(local.avatarDueno);
        }
      } else if (l.dueno) {
        l.dueno.destroy();
        l.dueno = undefined;
      }
    }
  }

  private ajustarZoom(): void {
    this.cameras.main.setZoom(zoomPara(this.scale.width, this.scale.height));
  }
}
