import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  BARRIOS,
  BARRIOS_ANTERIORES,
  LIMITES_SE_BUSCA,
  LISTA_BARRIOS,
  esCategoriaDe,
  formatoUsdc,
  primerLoteLibre,
  type Barrio,
} from '@cryptoville/shared';
import { Transform, Type } from 'class-transformer';
import { IsDate, IsIn, IsInt, IsString, Length, Matches, Max, Min } from 'class-validator';
import { AvisosService } from '../avisos/avisos.service';
import { SesionGuard } from '../common/sesion.guard';
import { serializar } from '../common/serializar';
import { UsuarioActual } from '../common/usuario-actual';
import { Prisma, type Usuario } from '../generated/prisma/client';
import { nuevoNumero } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';

const PRECIO = /^\d{1,9}(\.\d{1,7})?$/;
const HORA = 3_600_000;
const DIA = 24 * HORA;
const L = LIMITES_SE_BUSCA;

class BusquedaDto {
  @IsString()
  @Length(L.tituloMin, L.tituloMax, { message: `El título debe tener entre ${L.tituloMin} y ${L.tituloMax} caracteres` })
  titulo: string;

  @IsString()
  @Length(L.detalleMin, L.detalleMax, { message: `Cuenta qué necesitas (entre ${L.detalleMin} y ${L.detalleMax} caracteres)` })
  descripcion: string;

  /** Villa. Se aceptan también los nombres anteriores de los barrios. */
  @Transform(({ value }) => (typeof value === 'string' ? (BARRIOS_ANTERIORES[value] ?? value) : value))
  @IsIn(LISTA_BARRIOS, { message: 'Elige una villa: creativo, tech, audiovisual o academy' })
  barrio: Barrio;

  @IsString()
  categoria: string;

  @Matches(PRECIO, { message: 'Presupuesto inválido (USDC, hasta 7 decimales)' })
  presupuesto_usdc: string;

  @Type(() => Date)
  @IsDate({ message: 'Fecha límite inválida' })
  fecha_limite: Date;
}

class PropuestaDto {
  @Matches(PRECIO, { message: 'Monto inválido (USDC, hasta 7 decimales)' })
  monto_usdc: string;

  @IsInt({ message: 'Los días de entrega deben ser un número entero' })
  @Min(1, { message: 'Los días de entrega van de 1 a 90' })
  @Max(L.diasMax, { message: 'Los días de entrega van de 1 a 90' })
  dias_entrega: number;

  @IsString()
  @Length(L.mensajeMin, L.mensajeMax, { message: `Cuenta tu propuesta (entre ${L.mensajeMin} y ${L.mensajeMax} caracteres)` })
  mensaje: string;
}

const montoPositivo = (monto: string, que: string) => {
  if (Number(monto) <= 0) throw new BadRequestException(`El ${que} tiene que ser mayor que 0`);
};

/**
 * «Se busca»: quien necesita algo lo publica y los proveedores le mandan propuestas.
 * Al aceptar una propuesta nace un pedido ya aceptado; desde ahí todo sigue como siempre.
 */
@Injectable()
export class BusquedasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly avisos: AvisosService,
  ) {}

  async publicar(autor: Usuario, dto: BusquedaDto) {
    if (!esCategoriaDe(dto.barrio, dto.categoria)) {
      throw new BadRequestException(`Esa categoría no es de la Villa ${BARRIOS[dto.barrio].nombre}`);
    }
    montoPositivo(dto.presupuesto_usdc, 'presupuesto');
    const ahora = Date.now();
    if (dto.fecha_limite.getTime() < ahora + HORA || dto.fecha_limite.getTime() > ahora + L.diasMax * DIA) {
      throw new BadRequestException('La fecha límite debe ser entre 1 hora y 90 días desde ahora');
    }
    // Un «Se busca» a la vez por villa, para que dos publicaciones no tomen el mismo lote.
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`se-busca-${dto.barrio}`}))`;
      const visibles = await tx.busqueda.findMany({
        where: { barrio: dto.barrio, estado: 'abierta', fecha_limite: { gt: new Date() } },
        select: { lote: true },
      });
      return tx.busqueda.create({
        data: {
          autor_id: autor.id,
          titulo: dto.titulo.trim(),
          descripcion: dto.descripcion.trim(),
          barrio: dto.barrio,
          categoria: dto.categoria,
          lote: primerLoteLibre(visibles.map((v) => v.lote)),
          presupuesto_usdc: dto.presupuesto_usdc,
          fecha_limite: dto.fecha_limite,
        },
      });
    });
  }

  /** Quien publicó cierra su «Se busca» sin elegir a nadie. */
  async cerrar(yo: Usuario, id: string) {
    const busqueda = await this.cargar(id);
    if (busqueda.autor_id !== yo.id) throw new ForbiddenException('Solo quien lo publicó puede cerrarlo');
    if (busqueda.estado !== 'abierta') throw new ConflictException('Este «Se busca» ya está cerrado');
    const pendientes = await this.prisma.propuesta.findMany({ where: { busqueda_id: id, estado: 'enviada' }, select: { proveedor_id: true } });
    const [r] = await this.prisma.$transaction([
      this.prisma.busqueda.updateMany({ where: { id, estado: 'abierta' }, data: { estado: 'cancelada' } }),
      this.prisma.propuesta.updateMany({ where: { busqueda_id: id, estado: 'enviada' }, data: { estado: 'rechazada' } }),
    ]);
    if (r.count !== 1) throw new ConflictException('El «Se busca» cambió mientras tanto; recarga y vuelve a intentar');
    for (const p of pendientes) {
      await this.avisos.crear(p.proveedor_id, 'busqueda_cerrada', `${yo.nombre} cerró el «Se busca» «${busqueda.titulo}».`, null, id);
    }
    return this.cargar(id);
  }

  /** Un proveedor con local manda (o edita) su propuesta. */
  async proponer(yo: Usuario, id: string, dto: PropuestaDto) {
    const busqueda = await this.cargar(id);
    if (busqueda.autor_id === yo.id) throw new BadRequestException('No puedes mandarte una propuesta a ti mismo');
    if (busqueda.estado !== 'abierta') throw new ConflictException('Este «Se busca» ya no recibe propuestas');
    if (busqueda.fecha_limite.getTime() <= Date.now()) throw new ConflictException('Este «Se busca» ya venció');
    montoPositivo(dto.monto_usdc, 'monto');
    const local = await this.prisma.local.findUnique({ where: { usuario_id: yo.id } });
    if (!local || !local.activo) throw new ConflictException('Para mandar una propuesta, primero abre tu local');

    const anterior = await this.prisma.propuesta.findUnique({ where: { busqueda_id_proveedor_id: { busqueda_id: id, proveedor_id: yo.id } } });
    if (anterior && anterior.estado !== 'enviada' && anterior.estado !== 'retirada') {
      throw new ConflictException('Esta propuesta ya no se puede cambiar');
    }
    const datos = { monto_usdc: dto.monto_usdc, dias_entrega: dto.dias_entrega, mensaje: dto.mensaje.trim(), estado: 'enviada' as const };
    const propuesta = await this.prisma.$transaction(async (tx) => {
      const p = anterior
        ? await tx.propuesta.update({ where: { id: anterior.id }, data: datos })
        : await tx.propuesta.create({ data: { ...datos, busqueda_id: id, proveedor_id: yo.id } });
      await this.recontar(tx, id);
      return p;
    });
    // Se avisa cuando llega una propuesta nueva (o vuelve una retirada), no en cada edición.
    if (!anterior || anterior.estado === 'retirada') {
      await this.avisos.crear(
        busqueda.autor_id,
        'nueva_propuesta',
        `${yo.nombre} (${local.nombre}) te mandó una propuesta para «${busqueda.titulo}» por ${formatoUsdc(dto.monto_usdc)} USDC.`,
        null,
        id,
      );
    }
    return propuesta;
  }

  async retirar(yo: Usuario, propuestaId: string) {
    const propuesta = await this.prisma.propuesta.findUnique({ where: { id: propuestaId } });
    if (!propuesta) throw new NotFoundException('No existe esa propuesta');
    if (propuesta.proveedor_id !== yo.id) throw new ForbiddenException('Esa propuesta no es tuya');
    if (propuesta.estado !== 'enviada') throw new ConflictException('Solo se puede retirar una propuesta enviada');
    return this.prisma.$transaction(async (tx) => {
      const p = await tx.propuesta.update({ where: { id: propuestaId }, data: { estado: 'retirada' } });
      await this.recontar(tx, propuesta.busqueda_id);
      return p;
    });
  }

  /**
   * Quien publicó elige una propuesta: nace un pedido ya aceptado, con el precio y el plazo de la propuesta.
   * Para que el pedido funcione igual que los demás, se crea un servicio inactivo en el local del proveedor
   * (no aparece en su local ni cuenta para el tope de servicios).
   */
  async aceptar(yo: Usuario, propuestaId: string) {
    const propuesta = await this.prisma.propuesta.findUnique({
      where: { id: propuestaId },
      include: { busqueda: true, proveedor: { include: { local: true } } },
    });
    if (!propuesta) throw new NotFoundException('No existe esa propuesta');
    const { busqueda, proveedor } = propuesta;
    if (busqueda.autor_id !== yo.id) throw new ForbiddenException('Solo quien publicó el «Se busca» elige una propuesta');
    if (busqueda.estado !== 'abierta') throw new ConflictException('Este «Se busca» ya está cerrado');
    if (propuesta.estado !== 'enviada') throw new ConflictException('Esa propuesta ya no está disponible');
    if (!proveedor.local || !proveedor.local.activo) throw new ConflictException('Ese proveedor ya no tiene su local abierto');
    const local = proveedor.local;
    const rechazadas = await this.prisma.propuesta.findMany({
      where: { busqueda_id: busqueda.id, estado: 'enviada', NOT: { id: propuesta.id } },
      select: { proveedor_id: true },
    });

    for (let intento = 0; intento < 5; intento++) {
      try {
        const pedido = await this.prisma.$transaction(async (tx) => {
          const tomada = await tx.busqueda.updateMany({ where: { id: busqueda.id, estado: 'abierta' }, data: { estado: 'asignada' } });
          if (tomada.count !== 1) throw new ConflictException('El «Se busca» cambió mientras tanto; recarga y vuelve a intentar');
          const servicio = await tx.servicio.create({
            data: {
              local_id: local.id,
              titulo: busqueda.titulo,
              descripcion: busqueda.descripcion,
              precio_usdc: propuesta.monto_usdc,
              dias_entrega: propuesta.dias_entrega,
              activo: false,
              busqueda_id: busqueda.id,
            },
          });
          const nuevo = await tx.pedido.create({
            data: {
              numero: nuevoNumero(),
              servicio_id: servicio.id,
              cliente_id: yo.id,
              proveedor_id: proveedor.id,
              estado: 'aceptado',
              monto_usdc: propuesta.monto_usdc,
              detalle: busqueda.descripcion,
              fecha_limite: new Date(Date.now() + propuesta.dias_entrega * DIA),
            },
          });
          // La propuesta es la aceptación del proveedor: queda en el historial como "Aceptar pedido".
          await tx.pasoPedido.create({ data: { pedido_id: nuevo.id, accion: 'aceptar', declarado_por: proveedor.id } });
          await tx.busqueda.update({ where: { id: busqueda.id }, data: { pedido_id: nuevo.id } });
          await tx.propuesta.update({ where: { id: propuesta.id }, data: { estado: 'aceptada' } });
          await tx.propuesta.updateMany({ where: { busqueda_id: busqueda.id, estado: 'enviada' }, data: { estado: 'rechazada' } });
          await this.recontar(tx, busqueda.id);
          return nuevo;
        });
        const monto = formatoUsdc(String(propuesta.monto_usdc));
        await this.avisos.crear(
          proveedor.id,
          'propuesta_aceptada',
          `${yo.nombre} eligió tu propuesta para «${busqueda.titulo}» por ${monto} USDC. Espera el pago en garantía.`,
          pedido.id,
          busqueda.id,
        );
        await this.avisos.crear(
          yo.id,
          'te_toca_pagar',
          `Elegiste la propuesta de ${proveedor.nombre} por ${monto} USDC. Paga en garantía desde Stellar Lab para que empiece.`,
          pedido.id,
          busqueda.id,
        );
        for (const r of rechazadas) {
          await this.avisos.crear(r.proveedor_id, 'busqueda_cerrada', `${yo.nombre} eligió otra propuesta para «${busqueda.titulo}».`, null, busqueda.id);
        }
        return { pedido, busqueda: await this.cargar(busqueda.id) };
      } catch (e) {
        // Choque de número de pedido (muy raro): se reintenta con otro.
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      }
    }
    throw new ConflictException('No se pudo crear el pedido, intenta de nuevo');
  }

  private async cargar(id: string) {
    const busqueda = await this.prisma.busqueda.findUnique({ where: { id } });
    if (!busqueda) throw new NotFoundException('No existe ese «Se busca»');
    return busqueda;
  }

  /** Propuestas vigentes (enviadas o la elegida), para mostrar en el cartel. */
  private async recontar(tx: Prisma.TransactionClient, busquedaId: string) {
    const total = await tx.propuesta.count({ where: { busqueda_id: busquedaId, estado: { in: ['enviada', 'aceptada'] } } });
    await tx.busqueda.update({ where: { id: busquedaId }, data: { total_propuestas: total } });
  }
}

@Controller()
@UseGuards(SesionGuard)
export class BusquedasController {
  constructor(private readonly busquedas: BusquedasService) {}

  /** Publicar un «Se busca» (cualquier persona con sesión, aunque no tenga local). */
  @Post('busquedas')
  async publicar(@UsuarioActual() yo: Usuario, @Body() dto: BusquedaDto) {
    return serializar(await this.busquedas.publicar(yo, dto));
  }

  @Post('busquedas/:id/cerrar')
  @HttpCode(200)
  async cerrar(@UsuarioActual() yo: Usuario, @Param('id', ParseUUIDPipe) id: string) {
    return serializar(await this.busquedas.cerrar(yo, id));
  }

  /** Mandar o editar la propuesta propia (hace falta tener local). */
  @Post('busquedas/:id/propuestas')
  async proponer(@UsuarioActual() yo: Usuario, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PropuestaDto) {
    return serializar(await this.busquedas.proponer(yo, id, dto));
  }

  @Post('propuestas/:id/retirar')
  @HttpCode(200)
  async retirar(@UsuarioActual() yo: Usuario, @Param('id', ParseUUIDPipe) id: string) {
    return serializar(await this.busquedas.retirar(yo, id));
  }

  /** Elegir una propuesta: devuelve el pedido nuevo (ya aceptado, listo para pagar en garantía). */
  @Post('propuestas/:id/aceptar')
  @HttpCode(200)
  async aceptar(@UsuarioActual() yo: Usuario, @Param('id', ParseUUIDPipe) id: string) {
    return serializar(await this.busquedas.aceptar(yo, id));
  }
}

@Module({ controllers: [BusquedasController], providers: [BusquedasService] })
export class BusquedasModule {}
