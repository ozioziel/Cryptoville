import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { esFinal, permiteResena } from '@cryptoville/shared';
import { Type } from 'class-transformer';
import {
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
} from 'class-validator';
import { SesionGuard } from '../common/sesion.guard';
import { serializar } from '../common/serializar';
import { UsuarioActual } from '../common/usuario-actual';
import { EscrowService } from '../escrow/escrow.service';
import type { Parte, Usuario } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AvisosService } from '../avisos/avisos.service';
import { KycService } from '../kyc/kyc.module';
import { OrdersService } from './orders.service';
import { LocalesModule } from '../locales/locales.module';
import { RampasModule } from '../rampas/rampas.module';
import { TransaccionesController, TransaccionesService } from '../transacciones/transacciones.module';
import { PagosController } from '../pagos/pagos.controller';
import { PlanFaseDto } from '../pagos/pagos.controller';
import { PagosService } from '../pagos/pagos.service';
import { METODOS_PAGO, type MetodoPago } from '@cryptoville/shared';
import { ValidateNested, ArrayMaxSize, IsArray } from 'class-validator';
import { MONTO_USDC } from '../common/montos';

class CrearPedidoDto {
  @IsUUID('4')
  servicio_id: string;

  @IsString()
  @Length(10, 1000, { message: 'Cuenta qué necesitas (entre 10 y 1000 caracteres)' })
  detalle: string;

  /** Cómo quiere pagar el cliente (se elige antes de comprar). Por defecto, con garantía. */
  @IsOptional()
  @IsIn(METODOS_PAGO, { message: 'Elige pagar directo, con garantía o por etapas' })
  metodo_pago?: MetodoPago;
}

class AceptarDto {
  @Type(() => Date)
  @IsDate({ message: 'Fecha límite inválida' })
  fecha_limite: Date;

  @IsOptional()
  @Matches(MONTO_USDC, { message: 'Monto inválido (USDC mayor que 0, hasta 7 decimales)' })
  monto_usdc?: string;

  /** Por etapas: el plan de fases (lo mismo que POST /pedidos/:id/plan). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PlanFaseDto)
  fases?: PlanFaseDto[];
}

class PasoDto {
  @IsString()
  accion: string;

  @Matches(/^[0-9a-fA-F]{64}$/, { message: 'El hash debe tener 64 caracteres hexadecimales' })
  hash: string;

  @IsOptional()
  @IsString()
  @Length(10, 1000)
  motivo?: string;

  @IsOptional()
  @IsIn(['Cliente', 'Proveedor'])
  a_favor_de?: Parte;

  @IsOptional()
  @IsString()
  @Length(10, 1000)
  decision?: string;
}

class MensajeDto {
  @IsString()
  @Length(1, 1000, { message: 'El mensaje debe tener entre 1 y 1000 caracteres' })
  texto: string;
}

class ResenaDto {
  @IsInt()
  @Min(1)
  @Max(5)
  calificacion: number;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  comentario?: string;
}

@Controller('pedidos')
@UseGuards(SesionGuard)
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly escrow: EscrowService,
    private readonly prisma: PrismaService,
    private readonly avisos: AvisosService,
    private readonly kyc: KycService,
    private readonly pagos: PagosService,
  ) {}

  @Post()
  async crear(@UsuarioActual() yo: Usuario, @Body() dto: CrearPedidoDto) {
    const metodo = dto.metodo_pago ?? 'garantia';
    return serializar(await this.orders.crear(yo, dto.servicio_id, dto.detalle, { metodo, contrato: this.pagos.contratoPara(metodo) }));
  }

  /**
   * El proveedor acepta: fija el precio y la fecha límite.
   * - Por etapas: además manda el plan de fases (el cliente lo acepta antes de pagar).
   * - Con garantía en el contrato v2: el plan es una sola fase.
   */
  @Post(':id/aceptar')
  @HttpCode(200)
  async aceptar(@UsuarioActual() yo: Usuario, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AceptarDto) {
    const actual = await this.prisma.pedido.findUnique({ where: { id }, select: { metodo_pago: true } });
    if (actual?.metodo_pago === 'etapas') {
      if (!dto.fases?.length) throw new BadRequestException('Por etapas: manda el plan de fases');
      return serializar(await this.pagos.proponerPlan(yo, id, dto.fases, dto.monto_usdc));
    }
    const pedido = await this.orders.aceptar(yo, id, dto.fecha_limite, dto.monto_usdc);
    if (pedido.contrato === 'v2' && pedido.metodo_pago === 'garantia') await this.pagos.crearFaseUnica(pedido.id);
    return serializar(await this.prisma.pedido.findUniqueOrThrow({ where: { id } }));
  }

  @Post(':id/cancelar')
  @HttpCode(200)
  async cancelar(@UsuarioActual() yo: Usuario, @Param('id', ParseUUIDPipe) id: string) {
    return serializar(await this.orders.cancelar(yo, id));
  }

  /** Registra un paso hecho en Stellar Lab (con el hash de la transacción). */
  @Post(':id/pasos')
  async paso(@UsuarioActual() yo: Usuario, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PasoDto) {
    return serializar(await this.escrow.declarar(yo, id, dto));
  }

  @Post(':id/pasos/:pasoId/verificar')
  @HttpCode(200)
  async verificar(
    @UsuarioActual() yo: Usuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('pasoId', ParseUUIDPipe) pasoId: string,
  ) {
    return serializar(await this.escrow.verificar(yo, id, pasoId));
  }

  /** Chat del pedido (la web lo recibe en vivo con Supabase Realtime). */
  @Post(':id/mensajes')
  async mensaje(@UsuarioActual() yo: Usuario, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MensajeDto) {
    const { pedido, rol } = await this.orders.cargarVisible(id, yo);
    if (rol === 'arbitro' && pedido.estado !== 'en_disputa' && pedido.estado !== 'resuelto') {
      throw new ForbiddenException('El árbitro solo escribe en pedidos con disputa');
    }
    const texto = dto.texto.trim();
    if (!texto) throw new BadRequestException('El mensaje está vacío');
    const mensaje = await this.prisma.mensaje.create({ data: { pedido_id: id, autor_id: yo.id, texto } });
    const destinatarios = [pedido.cliente_id, pedido.proveedor_id].filter((u) => u !== yo.id);
    for (const destino of destinatarios) {
      const pendiente = await this.prisma.aviso.findFirst({
        where: { usuario_id: destino, pedido_id: id, tipo: 'nuevo_mensaje', leido: false },
      });
      if (!pendiente) {
        await this.avisos.crear(destino, 'nuevo_mensaje', `${yo.nombre} te escribió en el pedido #${pedido.numero}.`, id);
      }
    }
    return serializar(mensaje);
  }

  /** Reseña verificada: solo en pedidos cerrados con el dinero movido en el contrato. */
  @Post(':id/resenas')
  async resena(@UsuarioActual() yo: Usuario, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResenaDto) {
    const { pedido, rol } = await this.orders.cargarVisible(id, yo);
    if (rol !== 'cliente' && rol !== 'proveedor') throw new ForbiddenException('Solo el cliente y el proveedor reseñan');
    // Reseñar exige el KYC (si está encendido): así nadie infla su reputación con cuentas falsas.
    this.kyc.exigir(yo, 'resenar');
    if (!permiteResena(pedido.estado)) {
      throw new ForbiddenException(
        esFinal(pedido.estado)
          ? 'Este pedido se cerró sin pago liberado, no admite reseñas'
          : 'Podrás reseñar cuando el pago se libere o se resuelva la disputa',
      );
    }
    const resena = await this.prisma.resena.create({
      data: {
        pedido_id: id,
        autor_id: yo.id,
        destinatario_id: rol === 'cliente' ? pedido.proveedor_id : pedido.cliente_id,
        calificacion: dto.calificacion,
        comentario: dto.comentario?.trim() || null,
      },
    });
    return serializar(resena);
  }
}

@Module({
  imports: [LocalesModule, RampasModule],
  controllers: [OrdersController, TransaccionesController, PagosController],
  providers: [OrdersService, EscrowService, TransaccionesService, PagosService],
  exports: [OrdersService, EscrowService, PagosService],
})
export class OrdersModule {}
