import { Inject, Injectable, Logger, Module, type OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StellarService } from '../stellar/stellar.service';
import { variante } from '../stellar/cadena';
import { CONFIGURACION, type Configuracion } from './configuracion';
import { hayLlavesDeEjemplo, revisarParaArrancar } from './revision-mainnet';

/**
 * Revisión al arrancar la API.
 * En mainnet, si algo de prueba quedó configurado (llaves de ejemplo, USDC de prueba, pedidos de ejemplo,
 * sandbox, verificación apagada…) o el contrato no coincide con el .env, la API NO arranca y dice qué falta.
 * La lista completa de pasos para lanzar está en docs/mainnet.md.
 */
@Injectable()
export class RevisionArranqueService implements OnApplicationBootstrap {
  private readonly log = new Logger('Arranque');

  constructor(
    @Inject(CONFIGURACION) private readonly config: Configuracion,
    private readonly prisma: PrismaService,
    private readonly stellar: StellarService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.config.stellar.red !== 'mainnet') {
      if (!this.config.stellar.verificar && this.config.entorno !== 'test') {
        this.log.warn('La verificación en la red está apagada (STELLAR_VERIFICAR=no): los pasos se verifican a mano');
      }
      return;
    }
    const { problemas, avisos } = revisarParaArrancar(this.config, { llavesDeEjemplo: hayLlavesDeEjemplo() });
    const ejemplos = await this.prisma.pedido.count({ where: { es_ejemplo: true } });
    if (ejemplos > 0) problemas.push(`Hay ${ejemplos} pedidos de ejemplo en la base: mainnet usa una base nueva, sin el seed`);
    problemas.push(...(await this.revisarContratos()));
    for (const a of avisos) this.log.warn(a);
    if (problemas.length) {
      const texto = ['La API no arranca en mainnet hasta resolver esto (ver docs/mainnet.md):', ...problemas.map((p) => `  - ${p}`)].join('\n');
      this.log.error(texto);
      throw new Error(texto);
    }
    this.log.log('Revisión de mainnet: todo en orden');
  }

  /** La configuración del contrato en la red tiene que coincidir con el .env. */
  private async revisarContratos(): Promise<string[]> {
    const s = this.config.stellar;
    const problemas: string[] = [];
    for (const [nombre, id] of [
      ['ESCROW_CONTRACT_ID', s.contratoId],
      ['ESCROW_V2_CONTRACT_ID', s.contratoV2Id],
    ] as const) {
      if (!id) continue;
      let config: Record<string, unknown> | null;
      try {
        config = (await this.stellar.leer(id, 'config')) as Record<string, unknown> | null;
      } catch (e) {
        problemas.push(`No se pudo leer la configuración de ${nombre} en la red: ${(e as Error).message}`);
        continue;
      }
      if (!config) {
        problemas.push(`${nombre} no responde a config(): ¿es el contrato correcto?`);
        continue;
      }
      if (config.token !== s.tokenId) problemas.push(`${nombre}: el token del contrato no es PAYMENT_TOKEN_ID`);
      if (Number(config.comision_bps) !== s.comisionBps) problemas.push(`${nombre}: la comisión del contrato no es COMISION_BPS`);
      if (Number(config.plazo_revision_seg) !== s.plazoRevisionSeg) problemas.push(`${nombre}: el plazo de revisión del contrato no es PLAZO_REVISION_SEG`);
      if (s.tesoreria && config.tesoreria !== s.tesoreria) problemas.push(`${nombre}: la tesorería del contrato no es TESORERIA_DIRECCION`);
      // v1: el admin es el árbitro. v2: hay un rol "arbitro" separado.
      const arbitro = config.arbitro ?? config.admin;
      if (arbitro !== s.arbitro) problemas.push(`${nombre}: el árbitro del contrato no es ARBITRO_DIRECCION`);
      if (config.pausado === true) problemas.push(`${nombre}: el contrato está en pausa`);
      if (variante(config.estado) === 'Pausado') problemas.push(`${nombre}: el contrato está en pausa`);
    }
    return problemas;
  }
}

@Module({ providers: [RevisionArranqueService] })
export class ArranqueModule {}
