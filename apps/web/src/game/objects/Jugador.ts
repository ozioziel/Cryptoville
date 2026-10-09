import Phaser from 'phaser';
import { cuadroPersona, rumboPersona, type RumboPersona } from '../animacionPersona';

/** Velocidad al caminar, en píxeles del mundo por segundo. */
const VELOCIDAD = 230;
/** Tamaño del personaje en el mundo (el de la vecina de la muestra). */
export const ANCHO_JUGADOR = 46;
export const ALTO_JUGADOR = 70;

/** Personaje del jugador (persona en vectores) con física arcade. */
export class Jugador extends Phaser.Physics.Arcade.Sprite {
  private paso?: Phaser.Tweens.Tween;
  private escalaBase = 1;
  private rumbo: RumboPersona = 'frente';
  private inicioPaso: number | null = null;

  /** `clave` es una textura de persona de ANCHO_JUGADOR × ALTO_JUGADOR dibujada con `resolucion`. */
  constructor(escena: Phaser.Scene, x: number, y: number, clave: string, resolucion: number) {
    super(escena, x, y, clave);
    escena.add.existing(this);
    escena.physics.add.existing(this);
    this.setOrigin(0.5, 1);
    this.setDepth(y);
    (this.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true);
    this.ajustar(resolucion);
  }

  /** Mueve según una dirección normalizada (-1..1 en cada eje). */
  mover(dx: number, dy: number): void {
    const largo = Math.hypot(dx, dy);
    const cuerpo = this.body as Phaser.Physics.Arcade.Body;
    if (largo < 0.15) {
      cuerpo.setVelocity(0, 0);
      this.detenerPaso();
      this.inicioPaso = null;
      this.mostrarCuadro(false);
      return;
    }
    const factor = Math.min(1, largo) / largo;
    cuerpo.setVelocity(dx * factor * VELOCIDAD, dy * factor * VELOCIDAD);
    this.rumbo = rumboPersona(dx, dy, this.rumbo);
    this.inicioPaso ??= this.scene.time.now;
    this.setFlipX(false);
    this.mostrarCuadro(true);
    if (this.rumbo === 'frente') this.iniciarPaso();
    else this.detenerPaso();
  }

  /** Cambia la persona (por ejemplo, después de editarla en el perfil). */
  cambiarTextura(clave: string, resolucion: number): void {
    this.setTexture(clave);
    this.ajustar(resolucion);
    this.mostrarCuadro(false);
  }

  /**
   * @deprecated El jugador ya no usa frames de Kenney; la escena convierte el frame en una persona
   * y llama a `cambiarTextura`. Se conserva para no romper código anterior.
   */
  cambiarAvatar(frame: number): void {
    this.setData('avatar', frame);
  }

  private ajustar(resolucion: number): void {
    this.detenerPaso();
    this.escalaBase = 1 / resolucion;
    this.setScale(this.escalaBase);
    // Cuerpo de colisión en los pies (en píxeles de la textura), para poder pasar "por delante" de los techos.
    const cuerpo = this.body as Phaser.Physics.Arcade.Body;
    cuerpo.setSize(24 * resolucion, 12 * resolucion);
    cuerpo.setOffset(11 * resolucion, 55 * resolucion);
  }

  private mostrarCuadro(caminando: boolean): void {
    const cuadro = cuadroPersona(this.rumbo, caminando, this.scene.time.now - (this.inicioPaso ?? this.scene.time.now));
    if (this.texture.has(cuadro)) this.setFrame(cuadro);
  }

  private iniciarPaso(): void {
    if (this.paso?.isPlaying()) return;
    this.paso = this.scene.tweens.add({ targets: this, scaleY: this.escalaBase * 0.92, duration: 120, yoyo: true, repeat: -1 });
  }

  private detenerPaso(): void {
    this.paso?.stop();
    this.paso = undefined;
    this.setScale(this.escalaBase);
  }
}
