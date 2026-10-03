import Phaser from 'phaser';
import { emitir } from '../EventBus';
import { FUENTE_PIXEL } from '../objects/Letrero';
import { zoomPara } from '../zoom';

interface DatosInterior {
  nombre: string;
  avatarDueno: number;
  avatarJugador: number;
}

// Tiles de Kenney Tiny Dungeon (índices del tilesheet).
const PARED = 40;
const PISO = 48;
const MUEBLES: [number, number, number][] = [
  // [x, y, tile]
  [3, 1, 63], [4, 1, 63], [10, 1, 75], [6, 0, 29], [7, 0, 29],
  [5, 4, 72], [6, 4, 72], [7, 4, 72], [8, 4, 72],
  [11, 4, 89], [12, 4, 90], [1, 7, 73], [12, 7, 74], [6, 6, 66],
];
const ANCHO = 14;
const ALTO = 9;

/** Interior del local: decoración mientras el panel de servicios está abierto. */
export class Interior extends Phaser.Scene {
  constructor() {
    super('Interior');
  }

  create(datos: DatosInterior): void {
    this.cameras.main.setBackgroundColor('#1f1410');
    for (let y = 0; y < ALTO; y++) {
      for (let x = 0; x < ANCHO; x++) {
        this.add.image(x * 16 + 8, y * 16 + 8, 'personajes', y < 2 ? PARED : PISO);
      }
    }
    for (const [x, y, t] of MUEBLES) this.add.image(x * 16 + 8, y * 16 + 8, 'personajes', t);
    this.add.image(7 * 16 + 8, (ALTO - 1) * 16 + 8, 'personajes', 46);

    const dueno = this.add.sprite(6.5 * 16 + 8, 3 * 16 + 14, 'personajes', datos.avatarDueno).setOrigin(0.5, 1);
    this.tweens.add({ targets: dueno, y: dueno.y - 1, duration: 600, yoyo: true, repeat: -1 });
    this.add.sprite(7 * 16 + 8, 7 * 16 + 14, 'personajes', datos.avatarJugador).setOrigin(0.5, 1);

    this.add
      .text(ANCHO * 8, 2.4 * 16, datos.nombre, {
        fontFamily: FUENTE_PIXEL,
        fontSize: '40px',
        color: '#fdf6e3',
        stroke: '#3b2a25',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setScale(0.25);

    const camara = this.cameras.main;
    // El cuarto se centra en el espacio que deja libre el panel de React:
    // a la izquierda en escritorio (panel lateral de ~464 px) y arriba en celular (hoja inferior).
    const ajustar = () => {
      const { width, height } = this.scale;
      const zoom = Math.max(2, zoomPara(width, height) - 1);
      camara.setZoom(zoom);
      const escritorio = width > 700;
      const dx = escritorio ? 464 / 2 / zoom : 0;
      const dy = escritorio ? 0 : (height * 0.55) / 2 / zoom;
      camara.centerOn(ANCHO * 8 + dx, ALTO * 8 + dy);
    };
    ajustar();
    this.scale.on('resize', ajustar);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', ajustar));

    this.input.keyboard?.on('keydown-ESC', () => emitir('salio-del-local'));
  }
}
