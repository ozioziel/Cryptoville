import { Global, Module } from '@nestjs/common';
import { CONFIGURACION, leerConfiguracion } from './configuracion';

@Global()
@Module({
  providers: [{ provide: CONFIGURACION, useFactory: () => leerConfiguracion() }],
  exports: [CONFIGURACION],
})
export class ConfiguracionModule {}
