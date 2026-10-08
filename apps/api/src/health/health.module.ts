import { Controller, Get, Inject, Module, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { CONFIG_INICIAL, PASSPHRASE, datosRed, enlaceContrato } from '@cryptoville/shared';
import type { Response } from 'express';
import { CONFIGURACION, proveedorRampa, type Configuracion } from '../config/configuracion';
import { PrismaService } from '../prisma/prisma.service';
import { ContratoV2Service } from '../stellar/contrato-v2.service';
import { StellarService } from '../stellar/stellar.service';

@Controller()
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stellar: StellarService,
    private readonly contratoV2: ContratoV2Service,
    @Inject(CONFIGURACION) private readonly config: Configuracion,
  ) {}

  /** Salud de la API y de Supabase (base de datos y Auth). 503 si algo falla. */
  @Get('health')
  async health(@Res() res: Response) {
    const [db, auth] = await Promise.all([this.revisarDb(), this.revisarAuth()]);
    const ok = db && auth;
    res.status(ok ? 200 : 503).json({
      ok,
      api: true,
      supabase: { base_de_datos: db, auth },
      contrato_configurado: Boolean(this.config.stellar.contratoId),
      contrato_v2_configurado: Boolean(this.config.stellar.contratoV2Id),
      red: this.config.stellar.red,
      hora: new Date().toISOString(),
    });
  }

  /**
   * Configuración pública que necesita la web (no incluye ningún secreto).
   * `servicios` dice qué funciones están encendidas: la web esconde las que están apagadas.
   */
  @Get('config')
  config_publica() {
    const s = this.config.stellar;
    const sv = this.config.servicios;
    return {
      supabase_url: this.config.supabase.urlPublica,
      supabase_anon_key: this.config.supabase.anonKey,
      red: s.red,
      red_nombre: datosRed(s.red).label,
      passphrase: PASSPHRASE[s.red],
      contrato_id: s.contratoId,
      contrato_url: s.contratoId ? enlaceContrato(s.contratoId, s.red) : null,
      contrato_v2_id: s.contratoV2Id,
      contrato_v2_url: s.contratoV2Id ? enlaceContrato(s.contratoV2Id, s.red) : null,
      token_id: s.tokenId,
      asset: s.asset,
      arbitro: s.arbitro,
      tesoreria: s.tesoreria,
      comision_bps: s.comisionBps,
      plazo_revision_seg: s.plazoRevisionSeg,
      comision_max_bps: CONFIG_INICIAL.comision_max_bps,
      /** Plazos del contrato v2 (leídos de la red; si no se pudo, los del archivo de reglas). */
      plazos_v2: {
        revision_seg: this.contratoV2.plazos.revisionSeg,
        disputa_seg: this.contratoV2.plazos.disputaSeg,
        fuente: this.contratoV2.plazos.fuente,
      },
      /** Firmar dentro de la app (sin Stellar Lab). */
      firma_en_app: this.stellar.armaTransacciones && Boolean(s.contratoId),
      /** La API verifica cada paso en la red. */
      verificacion_en_cadena: this.stellar.verifica,
      servicios: {
        pollar_api_key: sv.pollar?.apiKey ?? null,
        walletconnect_project_id: sv.walletConnect?.projectId ?? null,
        kyc: Boolean(sv.didit && this.config.secretoKyc),
        videos: Boolean(sv.mux),
        correo: Boolean(sv.correo),
        push_publica: sv.push?.publica ?? null,
        /** Pagar con el QR del banco / pasar al banco: 'simulada' (solo testnet), 'pollar' (mainnet) o null. */
        rampa: proveedorRampa(this.config),
        entorno: this.config.entornoServicios,
      },
    };
  }

  private async revisarDb(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async revisarAuth(): Promise<boolean> {
    try {
      const r = await fetch(`${this.config.supabase.url}/auth/v1/health`, {
        headers: { apikey: this.config.supabase.anonKey },
        signal: AbortSignal.timeout(5000),
      });
      return r.ok;
    } catch {
      return false;
    }
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
