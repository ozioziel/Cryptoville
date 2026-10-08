import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { AvisosModule } from './avisos/avisos.service';
import { BusquedasModule } from './busquedas/busquedas.module';
import { ConfiguracionModule } from './config/config.module';
import { leerConfiguracion } from './config/configuracion';
import { DisputesModule } from './disputes/disputes.module';
import { HealthModule } from './health/health.module';
import { OrdersModule } from './orders/orders.module';
import { PrismaModule } from './prisma/prisma.service';
import { ReputationModule } from './reputation/reputation.module';
import { ServicesModule } from './services/services.module';
import { LocalesModule } from './locales/locales.module';
import { RampasModule } from './rampas/rampas.module';
import { PortafolioModule } from './portafolio/portafolio.module';
import { CercaniaModule } from './cercania/cercania.module';
import { SupabaseModule } from './supabase/supabase.service';
import { UploadsModule } from './uploads/uploads.module';
import { UsersModule } from './users/users.controller';
import { ArranqueModule } from './config/arranque.module';
import { LegalModule } from './legal/legal.module';
import { SincronizacionModule } from './sincronizacion/sincronizacion.module';
import { StellarModule } from './stellar/stellar.module';
import { WalletsModule } from './wallets/wallets.module';
import { KycModule } from './kyc/kyc.module';
import { ModeracionModule } from './moderacion/moderacion.module';
import { RecordatoriosModule } from './notificaciones/recordatorios.module';
import { VideosModule } from './videos/videos.module';

const config = leerConfiguracion();

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: config.logNivel,
        // Logs en JSON en producción; legibles en desarrollo.
        transport: config.entorno === 'development' ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
        redact: ['req.headers.authorization', 'req.headers.cookie', 'req.body.firma'],
        autoLogging: { ignore: (req) => req.url === '/api/health' },
      },
    }),
    // Límite general: 120 peticiones por minuto por IP (auth tiene uno más estricto).
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: config.entorno === 'test' ? 10_000 : 120 }]),
    ConfiguracionModule,
    PrismaModule,
    SupabaseModule,
    StellarModule,
    ArranqueModule,
    AvisosModule,
    KycModule,
    ModeracionModule,
    VideosModule,
    UsersModule,
    ServicesModule,
    LocalesModule,
    RampasModule,
    PortafolioModule,
    CercaniaModule,
    OrdersModule,
    BusquedasModule,
    DisputesModule,
    ReputationModule,
    UploadsModule,
    HealthModule,
    WalletsModule,
    LegalModule,
    SincronizacionModule,
    RecordatoriosModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
