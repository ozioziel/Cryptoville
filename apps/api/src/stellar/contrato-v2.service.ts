import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { reglasDe } from '@cryptoville/shared';
import { CONFIGURACION, type Configuracion } from '../config/configuracion';
import { StellarService } from './stellar.service';

export interface PlazosV2 {
  /** Plazo de revisión del cliente después de cada entrega. */
  revisionSeg: number;
  /** Si el árbitro no resuelve en este plazo, cualquiera puede repartir 50/50. */
  disputaSeg: number;
  /** De dónde salieron: del contrato en la red o, si no se pudo leer, del archivo de reglas. */
  fuente: 'contrato' | 'reglas';
}

const UNA_HORA = 60 * 60 * 1000;

/**
 * Plazos del contrato v2, leídos de la red con config(). El contrato manda: si el admin los cambia
 * (set_plazo_revision, set_plazo_disputa) o se usa un contrato de pruebas con plazos de minutos,
 * la API y la web usan esos y no los del archivo de reglas. Se vuelven a leer cada hora.
 */
@Injectable()
export class ContratoV2Service implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('ContratoV2');
  private leidos: { revisionSeg: number; disputaSeg: number } | null = null;
  private temporizador?: NodeJS.Timeout;

  constructor(
    @Inject(CONFIGURACION) private readonly config: Configuracion,
    private readonly stellar: StellarService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // En las pruebas automáticas no hay red: se usan las reglas.
    if (!this.config.stellar.contratoV2Id || this.config.entorno === 'test') return;
    await this.refrescar();
    this.temporizador = setInterval(() => void this.refrescar(), UNA_HORA);
    this.temporizador.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.temporizador);
  }

  async refrescar(): Promise<void> {
    const id = this.config.stellar.contratoV2Id;
    if (!id) return;
    try {
      const c = (await this.stellar.leer(id, 'config')) as Record<string, unknown> | null;
      const revisionSeg = Number(c?.plazo_revision_seg);
      const disputaSeg = Number(c?.plazo_disputa_seg);
      if (!(revisionSeg > 0 && disputaSeg > 0)) return;
      const reglas = reglasDe(this.config.stellar.red).plazos;
      const distintos = revisionSeg !== reglas.revisionSeg || disputaSeg !== reglas.disputaMaxSeg;
      const cambiaron = !this.leidos || this.leidos.revisionSeg !== revisionSeg || this.leidos.disputaSeg !== disputaSeg;
      if (distintos && cambiaron) {
        this.log.warn(
          `Los plazos del contrato v2 (revisión ${revisionSeg} s, disputa ${disputaSeg} s) no son los del archivo de reglas ` +
            `(${reglas.revisionSeg} s, ${reglas.disputaMaxSeg} s): se usan los del contrato`,
        );
      }
      this.leidos = { revisionSeg, disputaSeg };
    } catch (e) {
      this.log.warn(`No se pudo leer la configuración del contrato v2 (${(e as Error).message}): se usan los plazos del archivo de reglas`);
    }
  }

  get plazos(): PlazosV2 {
    if (this.leidos) return { ...this.leidos, fuente: 'contrato' };
    const reglas = reglasDe(this.config.stellar.red).plazos;
    return { revisionSeg: reglas.revisionSeg, disputaSeg: reglas.disputaMaxSeg, fuente: 'reglas' };
  }
}
