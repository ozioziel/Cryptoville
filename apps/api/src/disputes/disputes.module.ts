import { Controller, Get, Module, UseGuards } from '@nestjs/common';
import { SesionGuard, SoloArbitro } from '../common/sesion.guard';
import { serializar } from '../common/serializar';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Panel del árbitro. Abrir y resolver disputas son pasos del contrato
 * (POST /pedidos/:id/pasos con abrir_disputa o resolver, ver EscrowService).
 */
@Controller('arbitro')
@UseGuards(SesionGuard)
@SoloArbitro()
export class DisputesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('disputas')
  async disputas() {
    const disputas = await this.prisma.disputa.findMany({
      orderBy: [{ resuelta_en: { sort: 'desc', nulls: 'first' } }, { creado_en: 'desc' }],
      include: {
        pedido: { include: { cliente: true, proveedor: true, servicio: true, pasos: { orderBy: { creado_en: 'asc' } } } },
        autor: true,
      },
      take: 100,
    });
    return serializar(disputas);
  }
}

@Module({ controllers: [DisputesController] })
export class DisputesModule {}
