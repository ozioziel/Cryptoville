import Phaser from 'phaser';

export const FUENTE_PIXEL = '"Pixelify Sans", monospace';

/** Letrero con el nombre del local, encima de la casa. */
export class Letrero extends Phaser.GameObjects.Container {
  private fondo: Phaser.GameObjects.Rectangle;
  private texto: Phaser.GameObjects.Text;

  constructor(escena: Phaser.Scene, x: number, y: number) {
    super(escena, x, y);
    this.texto = escena.add
      .text(0, 0, '', { fontFamily: FUENTE_PIXEL, fontSize: '16px', color: '#3b2a25', resolution: 4 })
      .setOrigin(0.5)
      .setScale(0.36);
    this.fondo = escena.add.rectangle(0, 0, 10, 8, 0xfdf6e3).setStrokeStyle(1, 0x3b2a25);
    this.add([this.fondo, this.texto]);
    this.setDepth(20);
    escena.add.existing(this);
  }

  mostrar(nombre: string, color: string | null): void {
    this.texto.setText(nombre.length > 18 ? `${nombre.slice(0, 17)}…` : nombre);
    const ancho = Math.max(18, this.texto.displayWidth + 6);
    this.fondo.setSize(ancho, 8);
    this.fondo.setFillStyle(color ? Phaser.Display.Color.HexStringToColor(color).color : 0xe8e2d0);
    this.texto.setColor(color ? '#1f1410' : '#7a6f66');
  }
}
