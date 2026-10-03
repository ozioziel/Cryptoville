import { Controller, Get, Inject, Module, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { CONFIG_INICIAL, enlaceContrato } from '@cryptoville/shared';
import type { Response } from 'express';
import { CONFIGURACION, type Configuracion } from '../config/configuracion';
import { PrismaService } from '../prisma/prisma.service';

@Controller()
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
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
      hora: new Date().toISOString(),
    });
  }

  /** Configuración pública que necesita la web (no incluye ningún secreto). */
  @Get('config')
  config_publica() {
    const s = this.config.stellar;
    return {
      supabase_url: this.config.supabase.urlPublica,
      supabase_anon_key: this.config.supabase.anonKey,
      red: s.red,
      contrato_id: s.contratoId,
      contrato_url: s.contratoId ? enlaceContrato(s.contratoId, s.red) : null,
      token_id: s.tokenId,
      asset: s.asset,
      arbitro: s.arbitro,
      comision_bps: s.comisionBps,
      plazo_revision_seg: s.plazoRevisionSeg,
      comision_max_bps: CONFIG_INICIAL.comision_max_bps,
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
