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
  METODOS_PAGO,
  esCategoriaDe,
  formatoUsdc,
  primerLoteLibre,
  type Barrio,
  type MetodoPago,
  type PlanFase,
} from '@cryptoville/shared';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { AvisosService } from '../avisos/avisos.service';
import { SesionGuard } from '../common/sesion.guard';
import { serializar } from '../common/serializar';
import { UsuarioActual } from '../common/usuario-actual';
import { Prisma, type Local, type Usuario } from '../generated/prisma/client';
import { OrdersModule } from '../orders/orders.module';
import { nuevoNumero } from '../orders/orders.service';
import { KycService } from '../kyc/kyc.module';
import { LocalesModule, LocalesService } from '../locales/locales.module';
import { ModeracionService } from '../moderacion/moderacion.module';
import { PlanFaseDto } from '../pagos/pagos.controller';
import { PortafolioModule, PortafolioService } from '../portafolio/portafolio.module';
import { PagosService } from '../pagos/pagos.service';
import { PrismaService } from '../prisma/prisma.service';
import { walletParaCobrar } from '../wallets/wallets.module';
import { MONTO_USDC } from '../common/montos';

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

  @Matches(MONTO_USDC, { message: 'Presupuesto inválido (USDC mayor que 0, hasta 7 decimales)' })
  presupuesto_usdc: string;

  @Type(() => Date)
  @IsDate({ message: 'Fecha límite inválida' })
  fecha_limite: Date;
}

class PropuestaDto {
  @Matches(MONTO_USDC, { message: 'Monto inválido (USDC mayor que 0, hasta 7 decimales)' })
  monto_usdc: string;

  @IsInt({ message: 'Los días de entrega deben ser un número entero' })
  @Min(1, { message: 'Los días de entrega van de 1 a 90' })
  @Max(L.diasMax, { message: 'Los días de entrega van de 1 a 90' })
  dias_entrega: number;

  @IsString()
  @Length(L.mensajeMin, L.mensajeMax, { message: `Cuenta tu propuesta (entre ${L.mensajeMin} y ${L.mensajeMax} caracteres)` })
  mensaje: string;

  /** Local desde el que se propone (si tienes varios). Si no viene, el principal. */
  @IsOptional()
  @IsUUID('4')
  local_id?: string;

  /** Plan de fases (opcional): si quien publicó elige pagar por etapas, se usa este plan tal cual. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PlanFaseDto)
  fases?: PlanFaseDto[];

  /** Proyectos del portafolio que se adjuntan (hasta 5). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUUID('4', { each: true })
  proyectos?: string[];
}

class AceptarPropuestaDto {
  /** Cómo paga quien publicó. Si no viene, con garantía (como antes de v2). */
  @IsOptional()
  @IsIn(METODOS_PAGO, { message: 'Elige pagar directo, con garantía o por etapas' })
  metodo_pago?: MetodoPago;
}

/** Para los avisos: «Espera su pago en garantía», «Paga por etapas para que empiece»… */
const COMO_PAGA: Record<MetodoPago, string> = { directo: 'directo', garantia: 'en garantía', etapas: 'por etapas' };

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
    private readonly kyc: KycService,
    private readonly moderacion: ModeracionService,
    private readonly locales: LocalesService,
    private readonly pagos: PagosService,
    private readonly portafolio: PortafolioService,
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

  /** Un proveedor con local manda (o edita) su propuesta, desde el local que elija y, si quiere, con su plan de fases. */
  async proponer(yo: Usuario, id: string, dto: PropuestaDto) {
    const busqueda = await this.cargar(id);
    if (busqueda.autor_id === yo.id) throw new BadRequestException('No puedes mandarte una propuesta a ti mismo');
    if (busqueda.estado !== 'abierta') throw new ConflictException('Este «Se busca» ya no recibe propuestas');
    if (busqueda.fecha_limite.getTime() <= Date.now()) throw new ConflictException('Este «Se busca» ya venció');
    montoPositivo(dto.monto_usdc, 'monto');
    // Proponer es para cobrar: exige el KYC (si está encendido).
    this.kyc.exigir(yo, 'cobrar');
    await this.moderacion.exigirSinBloqueo(yo.id, busqueda.autor_id);
    const local = dto.local_id ? await this.locales.propio(yo, dto.local_id) : await this.locales.principal(yo.id);
    if (!local || !local.activo) throw new ConflictException('Para mandar una propuesta, primero abre tu local');
    let plan: PlanFase[] | null = null;
    let dias = dto.dias_entrega;
    if (dto.fases?.length) {
      plan = dto.fases.map((f) => ({ ...f, descripcion: f.descripcion.trim(), pruebas: [...new Set(f.pruebas)] }));
      this.pagos.validarPlanConMonto(plan, dto.monto_usdc);
      // Con plan, el plazo es hasta la última fase.
      dias = Math.min(L.diasMax, Math.max(1, Math.ceil((Date.parse(plan.at(-1)!.fecha_limite) - Date.now()) / DIA)));
    }

    const proyectos = await this.portafolio.proyectosPropios(yo, dto.proyectos ?? []);

    const anterior = await this.prisma.propuesta.findUnique({ where: { busqueda_id_proveedor_id: { busqueda_id: id, proveedor_id: yo.id } } });
    if (anterior && anterior.estado !== 'enviada' && anterior.estado !== 'retirada') {
      throw new ConflictException('Esta propuesta ya no se puede cambiar');
    }
    const datos = {
      proyectos,
      monto_usdc: dto.monto_usdc,
      dias_entrega: dias,
      mensaje: dto.mensaje.trim(),
      estado: 'enviada' as const,
      local_id: local.id,
      plan: plan ? (plan as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    };
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
   * Quien publicó elige una propuesta y cómo paga: nace un pedido ya aceptado, con el precio y el plazo de la propuesta.
   * - Por etapas: se usa el plan de la propuesta tal cual (elegir la propuesta es aceptar su plan).
   * Para que el pedido funcione igual que los demás, se crea un servicio inactivo en el local de la propuesta
   * (no aparece en su local ni cuenta para el tope de servicios).
   */
  async aceptar(yo: Usuario, propuestaId: string, metodo: MetodoPago = 'garantia') {
    const propuesta = await this.prisma.propuesta.findUnique({
      where: { id: propuestaId },
      include: { busqueda: true, proveedor: true, local: true },
    });
    if (!propuesta) throw new NotFoundException('No existe esa propuesta');
    const { busqueda, proveedor } = propuesta;
    if (busqueda.autor_id !== yo.id) throw new ForbiddenException('Solo quien publicó el «Se busca» elige una propuesta');
    if (busqueda.estado !== 'abierta') throw new ConflictException('Este «Se busca» ya está cerrado');
    if (propuesta.estado !== 'enviada') throw new ConflictException('Esa propuesta ya no está disponible');
    const local: Local | null = propuesta.local ?? (await this.locales.principal(proveedor.id));
    if (!local || !local.activo) throw new ConflictException('Ese proveedor ya no tiene su local abierto');
    const contrato = this.pagos.contratoPara(metodo);
    const monto = formatoUsdc(String(propuesta.monto_usdc));
    const plan = (propuesta.plan as unknown as PlanFase[] | null) ?? null;
    if (metodo === 'etapas') {
      if (!plan?.length) throw new ConflictException('Esta propuesta no trae un plan de fases: elige otro método o pídele que lo agregue');
      try {
        this.pagos.validarPlanConMonto(plan, monto);
      } catch (e) {
        throw new ConflictException(`El plan de esta propuesta ya no sirve (${(e as Error).message}). Pídele a ${proveedor.nombre} que lo actualice.`);
      }
    }
    const fechaLimite = metodo === 'etapas' ? new Date(plan!.at(-1)!.fecha_limite) : new Date(Date.now() + propuesta.dias_entrega * DIA);
    const direccionProveedor = await walletParaCobrar(this.prisma, proveedor);
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
              fecha_limite: fechaLimite,
              direccion_proveedor: direccionProveedor,
              metodo_pago: metodo,
              contrato,
              plan_aceptado_en: metodo === 'etapas' ? new Date() : null,
            },
          });
          // La propuesta es la aceptación del proveedor: queda en el historial como "Aceptar pedido".
          await tx.pasoPedido.create({ data: { pedido_id: nuevo.id, accion: 'aceptar', declarado_por: proveedor.id } });
          if (metodo === 'etapas') {
            await tx.fase.createMany({ data: this.pagos.filasDelPlan(nuevo.id, plan!, monto) });
            await tx.pasoPedido.create({ data: { pedido_id: nuevo.id, accion: 'aceptar_plan', declarado_por: yo.id } });
          }
          await tx.busqueda.update({ where: { id: busqueda.id }, data: { pedido_id: nuevo.id } });
          await tx.propuesta.update({ where: { id: propuesta.id }, data: { estado: 'aceptada' } });
          await tx.propuesta.updateMany({ where: { busqueda_id: busqueda.id, estado: 'enviada' }, data: { estado: 'rechazada' } });
          await this.recontar(tx, busqueda.id);
          return nuevo;
        });
        // Garantía en el contrato v2: el plan es una sola fase.
        if (contrato === 'v2' && metodo === 'garantia') await this.pagos.crearFaseUnica(pedido.id);
        await this.avisos.crear(
          proveedor.id,
          'propuesta_aceptada',
          `${yo.nombre} eligió tu propuesta para «${busqueda.titulo}» por ${monto} USDC. Espera su pago ${COMO_PAGA[metodo]}.`,
          pedido.id,
          busqueda.id,
        );
        await this.avisos.crear(
          yo.id,
          'te_toca_pagar',
          `Elegiste la propuesta de ${proveedor.nombre} por ${monto} USDC. Paga ${COMO_PAGA[metodo]} para que empiece.`,
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

  /** Mandar o editar la propuesta propia (hace falta tener local; si tienes varios, eliges desde cuál). */
  @Post('busquedas/:id/propuestas')
  async proponer(@UsuarioActual() yo: Usuario, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PropuestaDto) {
    return serializar(await this.busquedas.proponer(yo, id, dto));
  }

  @Post('propuestas/:id/retirar')
  @HttpCode(200)
  async retirar(@UsuarioActual() yo: Usuario, @Param('id', ParseUUIDPipe) id: string) {
    return serializar(await this.busquedas.retirar(yo, id));
  }

  /** Elegir una propuesta y cómo pagar: devuelve el pedido nuevo (ya aceptado, listo para pagar). */
  @Post('propuestas/:id/aceptar')
  @HttpCode(200)
  async aceptar(@UsuarioActual() yo: Usuario, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AceptarPropuestaDto) {
    return serializar(await this.busquedas.aceptar(yo, id, dto.metodo_pago));
  }
}

@Module({ imports: [OrdersModule, LocalesModule, PortafolioModule], controllers: [BusquedasController], providers: [BusquedasService] })
export class BusquedasModule {}
