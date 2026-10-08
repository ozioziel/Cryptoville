import { Global, Module } from '@nestjs/common';
import { ContratoV2Service } from './contrato-v2.service';
import { StellarService } from './stellar.service';
import { VerificadorService } from './verificador.service';

/** Lectura de la red de Stellar y verificación de los pasos (disponible en toda la API). */
@Global()
@Module({ providers: [StellarService, VerificadorService, ContratoV2Service], exports: [StellarService, VerificadorService, ContratoV2Service] })
export class StellarModule {}
