import {
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  HttpCode,
  Inject,
  Injectable,
  Module,
  NotFoundException,
  OnModuleInit,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { esTrabajoPublicable, reglasDe, type EstadoPedido, type RolTrabajo } from '@cryptoville/shared';
import { SesionGuard } from '../common/sesion.guard';
import { serializar } from '../common/serializar';
import { UsuarioActual } from '../common/usuario-actual';
import { CONFIGURACION, type Configuracion } from '../config/configuracion';
import { Prisma, type Usuario } from '../generated/prisma/client';
import { ModeracionService } from '../moderacion/moderacion.module';
import { PrismaService } from '../prisma/prisma.service';

/**
 * «Mis trabajos» → «Mostrar en mi perfil público». La lista privada de trabajos terminados la lee la web
 * de Supabase (los pedidos ya son solo de sus partes por RLS); aquí solo se elige qué se muestra en público.
 * Lo público lleva el título del servicio, la fecha y la transacción que cerró el pedido: nunca el monto
 * ni el detalle. El tope está en packages/shared/src/reglas.ts (`trabajos.maxPublicos`).
 */
@Injectable()
export class TrabajosService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moderacion: ModeracionService,
    @Inject(CONFIGURACION) private readonly config: Configuracion,
  ) {}

  /** Los reportes de un trabajo público: el dueño es quien lo mostró y «ocultar» lo saca de su perfil. */
  onModuleInit(): void {
    this.moderacion.registrar(
      'trabajo_publico',
      async (id) => (await this.prisma.trabajoPublico.findUnique({ where: { id }, select: { usuario_id: true } }))?.usuario_id ?? null,
      async (id) => {
        await this.prisma.trabajoPublico.updateMany({ where: { id }, data: { oculto: true } });
      },
    );
  }

  async mostrar(yo: Usuario, pedidoId: string) {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: {
        servicio: { select: { titulo: true } },
        pasos: { where: { hash: { not: null }, en_cadena: true }, orderBy: { creado_en: 'desc' }, take: 1 },
      },
    });
    if (!pedido) throw new NotFoundException('No existe ese pedido');
    const rol: RolTrabajo | null = pedido.proveedor_id === yo.id ? 'proveedor' : pedido.cliente_id === yo.id ? 'cliente' : null;
    if (!rol) throw new ForbiddenException('No participaste en ese pedido');
    if (!esTrabajoPublicable(pedido.estado as EstadoPedido)) {
      throw new ConflictException('Solo se pueden mostrar los trabajos terminados y pagados');
    }
    const ya = await this.prisma.trabajoPublico.findUnique({ where: { usuario_id_pedido_id: { usuario_id: yo.id, pedido_id: pedido.id } } });
    if (ya) return ya;
    const max = reglasDe(this.config.stellar.red).trabajos.maxPublicos;
    if ((await this.prisma.trabajoPublico.count({ where: { usuario_id: yo.id } })) >= max) {
      throw new ConflictException(`Puedes mostrar hasta ${max} trabajos en tu perfil: quita uno primero`);
    }
    const paso = pedido.pasos[0];
    try {
      return await this.prisma.trabajoPublico.create({
        data: {
          usuario_id: yo.id,
          pedido_id: pedido.id,
          rol,
          titulo: pedido.servicio.titulo.slice(0, 120),
          terminado_en: paso?.creado_en ?? pedido.actualizado_en,
          tx_hash: paso?.hash ?? null,
        },
      });
    } catch (e) {
      // Dos clics a la vez: el segundo encuentra el que creó el primero.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return this.prisma.trabajoPublico.findUniqueOrThrow({ where: { usuario_id_pedido_id: { usuario_id: yo.id, pedido_id: pedido.id } } });
      }
      throw e;
    }
  }

  async quitar(yo: Usuario, pedidoId: string) {
    const r = await this.prisma.trabajoPublico.deleteMany({ where: { usuario_id: yo.id, pedido_id: pedidoId } });
    return { quitado: r.count > 0 };
  }
}

@Controller('trabajos-publicos')
@UseGuards(SesionGuard)
export class TrabajosController {
  constructor(private readonly trabajos: TrabajosService) {}

  /** Mostrar un pedido terminado en mi perfil público (si ya estaba, lo devuelve igual). */
  @Post(':pedidoId')
  @HttpCode(200)
  async mostrar(@UsuarioActual() yo: Usuario, @Param('pedidoId', ParseUUIDPipe) pedidoId: string) {
    return serializar(await this.trabajos.mostrar(yo, pedidoId));
  }

  @Delete(':pedidoId')
  @HttpCode(200)
  async quitar(@UsuarioActual() yo: Usuario, @Param('pedidoId', ParseUUIDPipe) pedidoId: string) {
    return this.trabajos.quitar(yo, pedidoId);
  }
}

@Module({ controllers: [TrabajosController], providers: [TrabajosService] })
export class TrabajosModule {}
