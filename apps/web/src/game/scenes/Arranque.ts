import type { Lugar } from '@cryptoville/shared';
import Phaser from 'phaser';
import { FUENTE } from '../texturas';

/** Espera la fuente de la interfaz (los letreros del mapa la usan) y abre la villa inicial. */
export class Arranque extends Phaser.Scene {
  constructor() {
    super('Arranque');
  }

  create(): void {
    const { width, height } = this.scale;
    const dpr = (this.registry.get('dpr') as number | undefined) ?? 1;
    this.cameras.main.setBackgroundColor('#fdf6e3');
    const marco = this.add.graphics();
    marco.lineStyle(2 * dpr, 0x3b2a25, 0.3).strokeRoundedRect(width / 2 - 110 * dpr, height / 2 - 6 * dpr, 220 * dpr, 12 * dpr, 6 * dpr);
    const barra = this.add.graphics();
    this.add
      .text(width / 2, height / 2 - 28 * dpr, 'Cargando las villas…', { fontFamily: FUENTE, fontSize: `${15 * dpr}px`, fontStyle: '700', color: '#3b2a25' })
      .setOrigin(0.5);
    let avance = 0.15;
    const pintar = () => {
      barra.clear().fillStyle(0xe07a5f, 1).fillRoundedRect(width / 2 - 108 * dpr, height / 2 - 4 * dpr, 216 * dpr * avance, 8 * dpr, 4 * dpr);
    };
    pintar();
    const subir = this.time.addEvent({ delay: 80, loop: true, callback: () => ((avance = Math.min(0.9, avance + 0.08)), pintar()) });

    const fuentes = Promise.all(
      ['500', '600', '700', '800'].map((peso) => document.fonts?.load(`${peso} 16px "Plus Jakarta Sans"`) ?? Promise.resolve([])),
    );
    // Si la fuente tarda (sin internet), se sigue con la fuente del sistema.
    const limite = new Promise((listo) => setTimeout(listo, 3000));
    void Promise.race([fuentes, limite]).finally(() => {
      subir.remove();
      const villa = (this.registry.get('villa-inicial') as Lugar | undefined) ?? 'audiovisual';
      this.scene.start(`villa-${villa}`);
    });
  }
}
