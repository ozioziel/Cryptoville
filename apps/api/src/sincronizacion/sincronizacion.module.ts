import { Module } from '@nestjs/common';
import { RecordatoriosModule } from '../notificaciones/recordatorios.module';
import { OrdersModule } from '../orders/orders.module';
import { MantenimientoV2Service } from './mantenimiento-v2.service';
import { SincronizadorService } from './sincronizador.service';

export { SincronizadorService, type Sincronizable } from './sincronizador.service';

/** Sincronización con los contratos (v1 y v2) y mantenimiento del v2 (vencimientos y renovación). */
@Module({
  imports: [OrdersModule, RecordatoriosModule],
  providers: [SincronizadorService, MantenimientoV2Service],
  exports: [SincronizadorService],
})
export class SincronizacionModule {}
