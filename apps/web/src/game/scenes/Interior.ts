import { aparienciaDeAvatar, aparienciaDeUsuario, normalizarAparienciaCasa, type AparienciaPersona, type Barrio } from '@cryptoville/shared';
import Phaser from 'phaser';
import {
  ALTO_CUADRO,
  ALTO_INTERIOR,
  ANCHO_CUADRO,
  ANCHO_INTERIOR,
  CUADROS_INTERIOR,
  DUENO_INTERIOR,
  FOTO_CUADRO,
  JUGADOR_INTERIOR,
  PLACA_INTERIOR,
  crearCuadro,
  crearInterior,
} from '../../arte/casa';
import { crearInteriorEdificio } from '../../arte/edificio';
import { asegurarPersona } from '../animacionPersona';
import { hashTexto } from '../../arte/svg';
import { emitir, escuchar, type CuadroInterior, type DatosInterior } from '../EventBus';
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
 * También el del edificio de una persona en la Plaza (`tipo: 'edificio'`): su oficina, con los mismos cuadros.
 * El dueño está adentro mientras el panel del local está abierto; se sale con Esc o cerrando el panel.
 * Si el dueño tiene proyectos destacados en su portafolio, se cuelgan como cuadros en la pared
 * (en lugar de la decoración) y se abren al tocarlos.
 */
export class Interior extends Phaser.Scene {
  private texturas: string[] = [];
  private cuadros: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('Interior');
  }

  create(datos: DatosEscena): void {
    const dpr = (this.registry.get('dpr') as number | undefined) ?? 1;
    // La franja de «Modo de prueba» corre la barra superior hacia abajo.
    const margen = (this.registry.get('margenSuperior') as number | undefined) ?? 0;
    const camara = this.cameras.main;
    this.cuadros = [];
    camara.setBackgroundColor('#2f2724');

    // Zoom para que el cuarto quepa en el espacio que deja libre el panel de React:
    // a la izquierda en escritorio (panel lateral de 360 px) y arriba en celular (hoja inferior).
    const medidas = () => {
      const ancho = this.scale.width / dpr;
      const alto = this.scale.height / dpr;
      // Espacio libre en píxeles CSS (debajo de la barra superior).
      const libre =
        ancho > 700 ? { x: 16, y: 76 + margen, ancho: ancho - 392, alto: alto - 92 - margen } : { x: 0, y: 64 + margen, ancho, alto: alto * 0.45 - 64 - margen };
      const zoom = Math.max(0.35, Math.min(2.2, Math.min(libre.ancho / (ANCHO_INTERIOR + 40), libre.alto / (ALTO_INTERIOR + 40))));
      return { ancho, alto, libre, zoom };
    };
    const inicial = medidas();
    const R = resolucionTexturas(inicial.zoom, dpr);

    const esEdificio = datos.tipo === 'edificio';
    const barrio: Barrio = datos.barrio ?? 'audiovisual';
    const casa = normalizarAparienciaCasa(barrio, datos.aparienciaCasa);
    const color = datos.color ?? '#e07a5f';
    const claveCuarto = esEdificio ? `interior-edificio@${R}` : `interior:${barrio}:${hashTexto(JSON.stringify([color, casa]))}@${R}`;
    const dibujarCuarto = (sinDecoracion: boolean) => (t: { ancho: number; alto: number }) =>
      esEdificio ? crearInteriorEdificio({ tamano: t }) : crearInterior({ barrio, apariencia: casa, color }, { tamano: t, sinDecoracion });
    const dueno = aparienciaDeUsuario({ avatar: datos.avatarDueno, apariencia: datos.aparienciaDueno });
    const jugador = datos.aparienciaJugador ?? aparienciaDeAvatar(datos.avatarJugador ?? 85);
    const persona = (a: AparienciaPersona) => `persona-perfiles:${hashTexto(JSON.stringify(a))}@${R}`;
    const claveDueno = persona(dueno);
    const claveJugador = persona(jugador);
    this.texturas = [claveCuarto, claveDueno, claveJugador];
    this.texturas.forEach(usarTextura);

    const activa = () => this.sys.isActive();
    let cuarto: Phaser.GameObjects.Image | null = null;
    let conCuadros = false;
    void asegurarTextura(this, claveCuarto, dibujarCuarto(false), ANCHO_INTERIOR, ALTO_INTERIOR, R).then((ok) => {
      if (ok && activa() && !conCuadros) cuarto = this.add.image(0, 0, claveCuarto).setOrigin(0).setScale(1 / R).setDepth(0);
    });

    // Cuadros del portafolio: React los manda después de abrir el interior (se cargan aparte).
    const colgar = (lista: CuadroInterior[]) => {
      this.cuadros.forEach((o) => o.destroy());
      this.cuadros = [];
      if (!lista.length || !activa()) return;
      // Con cuadros, la pared del local va sin su decoración para que no se encimen (la del edificio ya está libre).
      if (!esEdificio) {
        conCuadros = true;
        const claveLisa = `${claveCuarto}:lisa`;
        this.texturas.push(claveLisa);
        usarTextura(claveLisa);
        void asegurarTextura(this, claveLisa, dibujarCuarto(true), ANCHO_INTERIOR, ALTO_INTERIOR, R).then((ok) => {
          if (!ok || !activa()) return;
          cuarto?.destroy();
          cuarto = this.add.image(0, 0, claveLisa).setOrigin(0).setScale(1 / R).setDepth(0);
        });
      }
      const claveMarco = `cuadro-marco@${R}`;
      this.texturas.push(claveMarco);
      usarTextura(claveMarco);
      void asegurarTextura(this, claveMarco, (t) => crearCuadro(t), ANCHO_CUADRO, ALTO_CUADRO, R).then((ok) => {
        if (!ok || !activa()) return;
        lista.slice(0, CUADROS_INTERIOR.length).forEach((c, i) => {
          const { x, y } = CUADROS_INTERIOR[i];
          const marco = this.add.image(x, y, claveMarco).setOrigin(0).setScale(1 / R).setDepth(5);
          marco.setInteractive({ useHandCursor: true }).on('pointerdown', () => emitir('abrir-proyecto', c.id));
          const rotulo = texto(this, x + ANCHO_CUADRO / 2, y + ALTO_CUADRO + 9, c.titulo, { tamano: 9, peso: 700, color: '#3b2a25' }, R * 1.5)
            .setDepth(6)
            .setVisible(false);
          while (rotulo.width > 92 && rotulo.text.length > 4) rotulo.setText(`${rotulo.text.slice(0, -2).trimEnd()}…`);
          marco.on('pointerover', () => rotulo.setVisible(true)).on('pointerout', () => rotulo.setVisible(false));
          this.cuadros.push(marco, rotulo);
          if (c.foto) this.ponerFoto(c, x, y);
        });
      });
    };
    const quitarCuadros = escuchar('cuadros-interior', colgar);
    void asegurarPersona(this, claveDueno, dueno, ANCHO_JUGADOR, ALTO_JUGADOR, R).then((ok) => {
      if (!ok || !activa()) return;
      const sprite = this.add.image(DUENO_INTERIOR.x, DUENO_INTERIOR.y, claveDueno).setOrigin(0.5, 1).setScale(1 / R).setDepth(DUENO_INTERIOR.y);
      this.tweens.add({ targets: sprite, y: sprite.y - 1.5, duration: 600, yoyo: true, repeat: -1 });
    });
    void asegurarPersona(this, claveJugador, jugador, ANCHO_JUGADOR, ALTO_JUGADOR, R).then((ok) => {
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
      quitarCuadros();
      this.scale.off('resize', ajustar);
      this.texturas.forEach((t) => soltarTextura(this, t));
      this.texturas = [];
      this.cuadros = [];
    });

    this.input.keyboard?.on('keydown-ESC', () => emitir('salio-del-local'));
  }

  /** La foto del proyecto, recortada para llenar el hueco del marco (si no carga, queda el dibujo del marco). */
  private ponerFoto(c: CuadroInterior, x: number, y: number): void {
    const clave = `foto-proyecto:${c.id}`;
    const dibujar = () => {
      if (!this.sys.isActive() || !this.textures.exists(clave)) return;
      const img = this.add.image(x + FOTO_CUADRO.x, y + FOTO_CUADRO.y, clave).setOrigin(0).setDepth(5.5);
      const fuente = this.textures.get(clave).getSourceImage() as HTMLImageElement;
      const escala = Math.max(FOTO_CUADRO.ancho / fuente.width, FOTO_CUADRO.alto / fuente.height);
      const recorteX = (fuente.width - FOTO_CUADRO.ancho / escala) / 2;
      const recorteY = (fuente.height - FOTO_CUADRO.alto / escala) / 2;
      img.setScale(escala).setCrop(recorteX, recorteY, FOTO_CUADRO.ancho / escala, FOTO_CUADRO.alto / escala);
      img.setPosition(x + FOTO_CUADRO.x - recorteX * escala, y + FOTO_CUADRO.y - recorteY * escala);
      img.setInteractive({ useHandCursor: true }).on('pointerdown', () => emitir('abrir-proyecto', c.id));
      this.cuadros.push(img);
    };
    if (this.textures.exists(clave)) return dibujar();
    this.load.setCORS('anonymous');
    this.load.image(clave, c.foto!);
    this.load.once(`filecomplete-image-${clave}`, dibujar);
    this.load.start();
  }
}
