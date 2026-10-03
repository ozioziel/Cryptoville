import { Controller, Get, Module, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface FilaReputacion {
  usuario_id: string;
  calificacion: string | null;
  total_resenas: number;
  completados: number;
  disputas_ganadas: number;
  disputas_perdidas: number;
  nivel: string;
}

/** Reputación pública (la web también la lee directo de la vista `reputacion` de Supabase). */
@Controller('reputacion')
export class ReputationController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':usuarioId')
  async de(@Param('usuarioId', ParseUUIDPipe) usuarioId: string) {
    const filas = await this.prisma.$queryRaw<FilaReputacion[]>`
      SELECT * FROM public.reputacion WHERE usuario_id = ${usuarioId}::uuid`;
    const fila = filas[0];
    if (!fila) throw new NotFoundException('No existe ese usuario');
    return { ...fila, calificacion: fila.calificacion === null ? null : Number(fila.calificacion) };
  }
}

@Module({ controllers: [ReputationController] })
export class ReputationModule {}
