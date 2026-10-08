import { LISTA_BARRIOS } from '@cryptoville/shared';
import Phaser from 'phaser';
import { useEffect, useRef } from 'react';
import { Arranque } from './scenes/Arranque';
import { Interior } from './scenes/Interior';
import { Villa } from './scenes/Villa';
import { modoGuardado, villaGuardada } from './villaInicial';

/** Densidad de la pantalla (con tope, para no crear lienzos gigantes). */
const densidad = () => Math.min(window.devicePixelRatio || 1, 3);

/**
 * Monta el juego de Phaser en un div que ocupa toda la pantalla (patrón de la plantilla oficial React + Phaser).
 * El lienzo se crea con la densidad real de la pantalla y se muestra reducido: así el arte vectorial
 * se ve nítido en celulares y pantallas retina.
 */
export function PhaserGame() {
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const div = contenedor.current;
    if (!div) return;
    let juego: Phaser.Game | null = null;
    const medir = () => ({ ancho: Math.max(1, div.clientWidth), alto: Math.max(1, div.clientHeight) });

    const ajustar = () => {
      if (!juego) return;
      const d = densidad();
      const { ancho, alto } = medir();
      juego.registry.set('dpr', d);
      juego.scale.setZoom(1 / d);
      juego.scale.resize(Math.round(ancho * d), Math.round(alto * d));
    };

    // Se crea en el siguiente ciclo: en modo estricto React monta y desmonta una vez de prueba,
    // y Phaser no puede destruir un juego que todavía no terminó de arrancar.
    const espera = setTimeout(() => {
      const d = densidad();
      const { ancho, alto } = medir();
      juego = new Phaser.Game({
        type: Phaser.AUTO,
        parent: div,
        backgroundColor: '#c8e4ad',
        // Arte vectorial: suavizado, sin redondear píxeles.
        pixelArt: false,
        antialias: true,
        roundPixels: false,
        scale: { mode: Phaser.Scale.NONE, width: Math.round(ancho * d), height: Math.round(alto * d), zoom: 1 / d },
        physics: { default: 'arcade', arcade: { debug: false } },
        input: { activePointers: 2 },
        // Cada villa es una escena aparte.
        scene: [Arranque, ...LISTA_BARRIOS.map((b) => new Villa(b)), Interior],
        callbacks: {
          preBoot: (g) => {
            g.registry.set('dpr', d);
            g.registry.set('villa-inicial', villaGuardada());
            g.registry.set('modo', modoGuardado());
          },
        },
      });
      // Solo en desarrollo: acceso desde la consola para depurar (window.__juego).
      if (import.meta.env.DEV) (window as unknown as { __juego?: Phaser.Game }).__juego = juego;
    }, 0);

    const observador = new ResizeObserver(ajustar);
    observador.observe(div);
    window.addEventListener('resize', ajustar);
    return () => {
      clearTimeout(espera);
      observador.disconnect();
      window.removeEventListener('resize', ajustar);
      juego?.destroy(true);
    };
  }, []);

  return <div ref={contenedor} className="juego" aria-label="Villas de WorkVille" />;
}
