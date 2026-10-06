import { aparienciaDeAvatar, aparienciaDeUsuario, normalizarAparienciaCasa, type AparienciaPersona, type Barrio } from '@cryptoville/shared';
import Phaser from 'phaser';
import {
  ALTO_INTERIOR,
  ANCHO_INTERIOR,
  DUENO_INTERIOR,
  JUGADOR_INTERIOR,
  PLACA_INTERIOR,
  crearInterior,
} from '../../arte/casa';
import { crearPersona } from '../../arte/persona';
import { hashTexto } from '../../arte/svg';
import { emitir, type DatosInterior } from '../EventBus';
import { ALTO_JUGADOR, ANCHO_JUGADOR } from '../objects/Jugador';
import { asegurarTextura, soltarTextura, texto, usarTextura } from '../texturas';
import { resolucionTexturas } from '../zoom';

interface DatosEscena extends DatosInterior {
  /** @deprecated El jugador ya no es un frame de Kenney; se usa `aparienciaJugador`. */
  avatarJugador?: number;
  aparienciaJugador?: AparienciaPersona;
}

/**
 * Interior del local (personalizable desde "Mi local"): piso, paredes, muebles y decoración.
 * El dueño está adentro mientras el panel del local está abierto; se sale con Esc o cerrando el panel.
 */
export class Interior extends Phaser.Scene {
  private texturas: string[] = [];

  constructor() {
    super('Interior');
  }

  create(datos: DatosEscena): void {
    const dpr = (this.registry.get('dpr') as number | undefined) ?? 1;
    const camara = this.cameras.main;
    camara.setBackgroundColor('#2f2724');

    // Zoom para que el cuarto quepa en el espacio que deja libre el panel de React:
    // a la izquierda en escritorio (panel lateral de 360 px) y arriba en celular (hoja inferior).
    const medidas = () => {
      const ancho = this.scale.width / dpr;
      const alto = this.scale.height / dpr;
      // Espacio libre en píxeles CSS (debajo de la barra superior).
      const libre = ancho > 700 ? { x: 16, y: 76, ancho: ancho - 392, alto: alto - 92 } : { x: 0, y: 64, ancho, alto: alto * 0.45 - 64 };
      const zoom = Math.max(0.35, Math.min(2.2, Math.min(libre.ancho / (ANCHO_INTERIOR + 40), libre.alto / (ALTO_INTERIOR + 40))));
      return { ancho, alto, libre, zoom };
    };
    const inicial = medidas();
    const R = resolucionTexturas(inicial.zoom, dpr);

    const barrio: Barrio = datos.barrio ?? 'audiovisual';
    const casa = normalizarAparienciaCasa(barrio, datos.aparienciaCasa);
    const color = datos.color ?? '#e07a5f';
    const claveCuarto = `interior:${barrio}:${hashTexto(JSON.stringify([color, casa]))}@${R}`;
    const dueno = aparienciaDeUsuario({ avatar: datos.avatarDueno, apariencia: datos.aparienciaDueno });
    const jugador = datos.aparienciaJugador ?? aparienciaDeAvatar(datos.avatarJugador ?? 85);
    const persona = (a: AparienciaPersona) => `persona:${hashTexto(JSON.stringify(a))}@${R}`;
    const claveDueno = persona(dueno);
    const claveJugador = persona(jugador);
    this.texturas = [claveCuarto, claveDueno, claveJugador];
    this.texturas.forEach(usarTextura);

    const activa = () => this.sys.isActive();
    void asegurarTextura(this, claveCuarto, (t) => crearInterior({ barrio, apariencia: casa, color }, { tamano: t }), ANCHO_INTERIOR, ALTO_INTERIOR, R).then((ok) => {
      if (ok && activa()) this.add.image(0, 0, claveCuarto).setOrigin(0).setScale(1 / R).setDepth(0);
    });
    void asegurarTextura(this, claveDueno, (t) => crearPersona(dueno, { tamano: t }), ANCHO_JUGADOR, ALTO_JUGADOR, R).then((ok) => {
      if (!ok || !activa()) return;
      const sprite = this.add.image(DUENO_INTERIOR.x, DUENO_INTERIOR.y, claveDueno).setOrigin(0.5, 1).setScale(1 / R).setDepth(DUENO_INTERIOR.y);
      this.tweens.add({ targets: sprite, y: sprite.y - 1.5, duration: 600, yoyo: true, repeat: -1 });
    });
    void asegurarTextura(this, claveJugador, (t) => crearPersona(jugador, { tamano: t }), ANCHO_JUGADOR, ALTO_JUGADOR, R).then((ok) => {
      if (ok && activa()) this.add.image(JUGADOR_INTERIOR.x, JUGADOR_INTERIOR.y, claveJugador).setOrigin(0.5, 1).setScale(1 / R).setDepth(JUGADOR_INTERIOR.y);
    });

    const nombre = texto(this, PLACA_INTERIOR.x, PLACA_INTERIOR.y, datos.nombre, { tamano: 15, peso: 800, color: '#3b2a25' }, R * 1.5).setDepth(10);
    while (nombre.width > 148 && nombre.text.length > 4) nombre.setText(`${nombre.text.slice(0, -2).trimEnd()}…`);

    const ajustar = () => {
      const m = medidas();
      camara.setZoom(m.zoom * dpr);
      // El centro del cuarto queda en el centro del espacio libre.
      const cx = m.libre.x + m.libre.ancho / 2 - m.ancho / 2;
      const cy = m.libre.y + m.libre.alto / 2 - m.alto / 2;
      camara.centerOn(ANCHO_INTERIOR / 2 - cx / m.zoom, ALTO_INTERIOR / 2 - cy / m.zoom);
    };
    ajustar();
    this.scale.on('resize', ajustar);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', ajustar);
      this.texturas.forEach((t) => soltarTextura(this, t));
      this.texturas = [];
    });

    this.input.keyboard?.on('keydown-ESC', () => emitir('salio-del-local'));
  }
}
