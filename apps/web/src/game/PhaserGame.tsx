import Phaser from 'phaser';
import { useEffect, useRef } from 'react';
import { Arranque } from './scenes/Arranque';
import { Interior } from './scenes/Interior';
import { Pueblo } from './scenes/Pueblo';

/** Monta el juego de Phaser en un div que ocupa toda la pantalla (patrón de la plantilla oficial React + Phaser). */
export function PhaserGame() {
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const div = contenedor.current;
    if (!div) return;
    let juego: Phaser.Game | null = null;
    // Se crea en el siguiente ciclo: en modo estricto React monta y desmonta una vez de prueba,
    // y Phaser no puede destruir un juego que todavía no terminó de arrancar.
    const espera = setTimeout(() => {
      juego = new Phaser.Game({
        type: Phaser.AUTO,
        parent: div,
        backgroundColor: '#7cc254',
        pixelArt: true,
        roundPixels: true,
        scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
        physics: { default: 'arcade', arcade: { debug: false } },
        input: { activePointers: 2 },
        scene: [Arranque, Pueblo, Interior],
      });
      // Solo en desarrollo: acceso desde la consola para depurar (window.__juego).
      if (import.meta.env.DEV) (window as unknown as { __juego?: Phaser.Game }).__juego = juego;
    }, 0);
    return () => {
      clearTimeout(espera);
      juego?.destroy(true);
    };
  }, []);

  return <div ref={contenedor} className="juego" aria-label="Pueblo de Cryptoville" />;
}
