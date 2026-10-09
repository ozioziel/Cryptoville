import { Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { primerLoteLibre } from '@cryptoville/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * El edificio de cada persona en la Plaza principal (CVs): `usuarios.lote_plaza`.
 * - Se asigna al abrir su primer local: el primer lote libre (se reutilizan los huecos).
 * - Se libera al archivar su último local.
 * - Al arrancar, se asigna a quien tenga locales y todavía no tenga edificio (por si algo quedó sin hacer).
 * Igual que en las villas, la posición del edificio depende solo de su lote, así que nunca se mueve.
 */
@Injectable()
export class PlazaService implements OnModuleInit {
  private readonly log = new Logger('Plaza');

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      const n = await this.asignarPendientes();
      if (n) this.log.log(`Edificios asignados en la Plaza: ${n}`);
    } catch (e) {
      // La API arranca igual: se vuelve a intentar al abrir el próximo local.
      this.log.warn(`No se pudieron revisar los edificios de la Plaza: ${(e as Error).message}`);
    }
  }

  /** Da edificio a quien tiene al menos un local sin archivar (si ya lo tiene, no cambia). */
  async asignar(usuarioId: string): Promise<number | null> {
    return this.prisma.$transaction(async (tx) => {
      // Un edificio a la vez, para que dos personas no tomen el mismo lote.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('plaza-lotes'))`;
      const yo = await tx.usuario.findUnique({ where: { id: usuarioId }, select: { lote_plaza: true } });
      if (!yo) return null;
      if (yo.lote_plaza) return yo.lote_plaza;
      const tieneLocal = await tx.local.count({ where: { usuario_id: usuarioId, archivado_en: null } });
      if (!tieneLocal) return null;
      const ocupados = await tx.usuario.findMany({ where: { lote_plaza: { not: null } }, select: { lote_plaza: true } });
      const lote = primerLoteLibre(ocupados.map((o) => o.lote_plaza!));
      await tx.usuario.update({ where: { id: usuarioId }, data: { lote_plaza: lote } });
      return lote;
    });
  }

  /** Si ya no le queda ningún local, su edificio se va de la Plaza (el lote queda libre). */
  async liberarSiNoTieneLocales(usuarioId: string): Promise<void> {
    const quedan = await this.prisma.local.count({ where: { usuario_id: usuarioId, archivado_en: null } });
    if (!quedan) await this.prisma.usuario.updateMany({ where: { id: usuarioId, lote_plaza: { not: null } }, data: { lote_plaza: null } });
  }

  /** Quien tiene locales y no tiene edificio (lo usa el arranque; la migración ya hizo el primero). */
  async asignarPendientes(): Promise<number> {
    const pendientes = await this.prisma.usuario.findMany({
      where: { lote_plaza: null, locales: { some: { archivado_en: null, activo: true } } },
      select: { id: true },
      orderBy: { creado_en: 'asc' },
    });
    for (const u of pendientes) await this.asignar(u.id);
    return pendientes.length;
  }
}

@Module({ providers: [PlazaService], exports: [PlazaService] })
export class PlazaModule {}
