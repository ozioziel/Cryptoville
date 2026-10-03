import Phaser from 'phaser';

/** Carga el mapa y los gráficos de Kenney, con una barra de progreso. */
export class Arranque extends Phaser.Scene {
  constructor() {
    super('Arranque');
  }

  preload(): void {
    const { width, height } = this.scale;
    const marco = this.add.rectangle(width / 2, height / 2, 220, 18).setStrokeStyle(2, 0x3b2a25);
    const barra = this.add.rectangle(width / 2 - 108, height / 2, 4, 12, 0xe07a5f).setOrigin(0, 0.5);
    this.add
      .text(width / 2, height / 2 - 26, 'Cargando el pueblo…', { fontFamily: 'monospace', fontSize: '14px', color: '#3b2a25' })
      .setOrigin(0.5);
    this.load.on('progress', (p: number) => barra.setSize(4 + 212 * p, 12));
    this.load.on('complete', () => marco.destroy());

    this.load.tilemapTiledJSON('pueblo', 'assets/mapas/pueblo.json');
    this.load.image('tiny-town', 'assets/kenney/tiny-town.png');
    this.load.spritesheet('town', 'assets/kenney/tiny-town.png', { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('personajes', 'assets/kenney/tiny-dungeon.png', { frameWidth: 16, frameHeight: 16 });
  }

  create(): void {
    this.scene.start('Pueblo');
  }
}
