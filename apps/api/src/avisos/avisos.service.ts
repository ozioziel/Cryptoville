import { Body, Controller, Global, HttpCode, Injectable, Module, Post, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsOptional, IsUUID } from 'class-validator';
import { SesionGuard } from '../common/sesion.guard';
import { UsuarioActual } from '../common/usuario-actual';
import type { TipoAviso, Usuario } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Avisos en vivo: se guardan en la tabla `avisos` y la web los recibe por Supabase Realtime. */
@Injectable()
export class AvisosService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(usuarioId: string, tipo: TipoAviso, texto: string, pedidoId?: string | null, busquedaId?: string | null): Promise<void> {
    await this.prisma.aviso.create({
      data: { usuario_id: usuarioId, tipo, texto, pedido_id: pedidoId ?? null, busqueda_id: busquedaId ?? null },
    });
  }
}

class LeidosDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  ids?: string[];
}

@Controller('avisos')
@UseGuards(SesionGuard)
export class AvisosController {
  constructor(private readonly prisma: PrismaService) {}

  /** Marca como leídos los avisos indicados (o todos si no se envían ids). */
  @Post('leidos')
  @HttpCode(200)
  async leidos(@UsuarioActual() yo: Usuario, @Body() dto: LeidosDto) {
    const r = await this.prisma.aviso.updateMany({
      where: { usuario_id: yo.id, leido: false, ...(dto.ids?.length ? { id: { in: dto.ids } } : {}) },
      data: { leido: true },
    });
    return { actualizados: r.count };
  }
}

@Global()
@Module({ providers: [AvisosService], controllers: [AvisosController], exports: [AvisosService] })
export class AvisosModule {}
