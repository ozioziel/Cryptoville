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
import { OrdersService } from './orders.service';

class CrearPedidoDto {
  @IsUUID('4')
  servicio_id: string;

  @IsString()
  @Length(10, 1000, { message: 'Cuenta qué necesitas (entre 10 y 1000 caracteres)' })
  detalle: string;
}

class AceptarDto {
  @Type(() => Date)
  @IsDate({ message: 'Fecha límite inválida' })
  fecha_limite: Date;

  @IsOptional()
  @Matches(/^\d{1,9}(\.\d{1,7})?$/, { message: 'Monto inválido (USDC, hasta 7 decimales)' })
  monto_usdc?: string;
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
  ) {}

  @Post()
  async crear(@UsuarioActual() yo: Usuario, @Body() dto: CrearPedidoDto) {
    return serializar(await this.orders.crear(yo, dto.servicio_id, dto.detalle));
  }

  @Post(':id/aceptar')
  @HttpCode(200)
  async aceptar(@UsuarioActual() yo: Usuario, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AceptarDto) {
    return serializar(await this.orders.aceptar(yo, id, dto.fecha_limite, dto.monto_usdc));
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

@Module({ controllers: [OrdersController], providers: [OrdersService, EscrowService] })
export class OrdersModule {}
