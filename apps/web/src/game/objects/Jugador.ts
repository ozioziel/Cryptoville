import Phaser from 'phaser';

const VELOCIDAD = 72;

/** Personaje del jugador (sprite de Kenney Tiny Dungeon) con física arcade. */
export class Jugador extends Phaser.Physics.Arcade.Sprite {
  private paso?: Phaser.Tweens.Tween;

  constructor(escena: Phaser.Scene, x: number, y: number, frame: number) {
    super(escena, x, y, 'personajes', frame);
    escena.add.existing(this);
    escena.physics.add.existing(this);
    this.setOrigin(0.5, 1);
    this.setDepth(10);
    const cuerpo = this.body as Phaser.Physics.Arcade.Body;
    // Hitbox en los pies, para poder pasar "por delante" de los techos.
    cuerpo.setSize(10, 6).setOffset(3, 10);
    cuerpo.setCollideWorldBounds(true);
  }

  /** Mueve según una dirección normalizada (-1..1 en cada eje). */
  mover(dx: number, dy: number): void {
    const largo = Math.hypot(dx, dy);
    const cuerpo = this.body as Phaser.Physics.Arcade.Body;
    if (largo < 0.15) {
      cuerpo.setVelocity(0, 0);
      this.detenerPaso();
      return;
    }
    const factor = Math.min(1, largo) / largo;
    cuerpo.setVelocity(dx * factor * VELOCIDAD, dy * factor * VELOCIDAD);
    if (Math.abs(dx) > 0.1) this.setFlipX(dx < 0);
    this.iniciarPaso();
  }

  cambiarAvatar(frame: number): void {
    this.setFrame(frame);
  }

  private iniciarPaso(): void {
    if (this.paso?.isPlaying()) return;
    this.paso = this.scene.tweens.add({ targets: this, scaleY: 0.9, duration: 120, yoyo: true, repeat: -1 });
  }

  private detenerPaso(): void {
    this.paso?.stop();
    this.paso = undefined;
    this.setScale(1);
  }
}
