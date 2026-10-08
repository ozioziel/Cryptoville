import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { METODOS_PAGO, TIPOS_PRUEBA, type MetodoPago, type TipoPrueba } from '@cryptoville/shared';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { SesionGuard } from '../common/sesion.guard';
import { serializar } from '../common/serializar';
import { UsuarioActual } from '../common/usuario-actual';
import type { Usuario } from '../generated/prisma/client';
import { PagosService, type ResultadoDisputa } from './pagos.service';
import { MONTO_USDC } from '../common/montos';

export class PlanFaseDto {
  @IsString()
  @Length(3, 300, { message: 'Cuenta qué incluye cada fase (entre 3 y 300 caracteres)' })
  descripcion: string;

  @IsInt()
  @Min(1)
  @Max(100)
  porcentaje_proyecto: number;

  @IsInt()
  @Min(1)
  @Max(100)
  porcentaje_pago: number;

  @IsISO8601({}, { message: 'Fecha de fase inválida' })
  fecha_limite: string;

  @IsArray()
  @ArrayMaxSize(3)
  @IsIn(TIPOS_PRUEBA, { each: true, message: 'Las pruebas pueden ser archivo, enlace o video' })
  pruebas: TipoPrueba[];
}

class PlanDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PlanFaseDto)
  fases: PlanFaseDto[];

  @IsOptional()
  @Matches(MONTO_USDC, { message: 'Monto inválido (USDC mayor que 0, hasta 7 decimales)' })
  monto_usdc?: string;
}

class MetodoDto {
  @IsIn(METODOS_PAGO, { message: 'Elige pagar directo, con garantía o por etapas' })
  metodo_pago: MetodoPago;
}

class ComentarioPlanDto {
  @IsString()
  @Length(5, 500, { message: 'Cuéntale al proveedor qué cambiarías (entre 5 y 500 caracteres)' })
  comentario: string;
}

class SubidaPruebaDto {
  @IsInt()
  @Min(0)
  @Max(9)
  fase: number;

  @IsString()
  tipo: string;

  @IsInt()
  @Min(1)
  tamano: number;
}

class PruebaDto {
  @IsInt()
  @Min(0)
  @Max(9)
  fase: number;

  @IsIn(TIPOS_PRUEBA)
  tipo: TipoPrueba;

  @IsString()
  @Length(1, 120, { message: 'Ponle un título a la prueba (hasta 120 caracteres)' })
  titulo: string;

  @IsOptional()
  @IsString()
  @Length(1, 300)
  ruta?: string;

  @IsOptional()
  @IsString()
  @Length(10, 500)
  url?: string;

  @IsOptional()
  @IsUUID('4')
  video_id?: string;

  @IsOptional()
  @IsIn(['entrega', 'disputa'])
  para?: 'entrega' | 'disputa';
}

class PasoV2Dto {
  @IsIn(PagosService.FUNCIONES_PASO as unknown as string[])
  accion: (typeof PagosService.FUNCIONES_PASO)[number];

  @Matches(/^[0-9a-fA-F]{64}$/, { message: 'El hash debe tener 64 caracteres hexadecimales' })
  hash: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9)
  fase?: number;

  @IsOptional()
  @IsIn(['Cliente', 'Proveedor', 'Mitad'])
  resultado?: ResultadoDisputa;

  @IsOptional()
  @IsString()
  @Length(10, 1000)
  motivo?: string;

  @IsOptional()
  @IsString()
  @Length(10, 1000)
  decision?: string;
}

/** Métodos de pago, plan de fases, pago directo, pruebas y expediente (Cryptoville v2). */
@Controller()
@UseGuards(SesionGuard)
export class PagosController {
  constructor(private readonly pagos: PagosService) {}

  @Get('pagos/metodos')
  metodos() {
    return { metodos: this.pagos.metodosDisponibles(), contrato_v2: Boolean(this.pagos.contratoV2) };
  }

  @Post('pedidos/:id/metodo')
  @HttpCode(200)
  async metodo(@UsuarioActual() yo: Usuario, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MetodoDto) {
    return serializar(await this.pagos.cambiarMetodo(yo, id, dto.metodo_pago));
  }

  /** Por etapas: el proveedor acepta con su plan (o lo corrige). */
  @Post('pedidos/:id/plan')
  @HttpCode(200)
  async plan(@UsuarioActual() yo: Usuario, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PlanDto) {
    return serializar(await this.pagos.proponerPlan(yo, id, dto.fases, dto.monto_usdc));
  }

  @Post('pedidos/:id/plan/aceptar')
  @HttpCode(200)
  async aceptarPlan(@UsuarioActual() yo: Usuario, @Param('id', ParseUUIDPipe) id: string) {
    return serializar(await this.pagos.aceptarPlan(yo, id));
  }

  @Post('pedidos/:id/plan/cambios')
  @HttpCode(200)
  async cambiosPlan(@UsuarioActual() yo: Usuario, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ComentarioPlanDto) {
    return serializar(await this.pagos.pedirCambiosPlan(yo, id, dto.comentario));
  }

  @Post('pedidos/:id/directo/entregado')
  @HttpCode(200)
  async entregadoDirecto(@UsuarioActual() yo: Usuario, @Param('id', ParseUUIDPipe) id: string) {
    return serializar(await this.pagos.entregadoDirecto(yo, id));
  }

  @Post('pedidos/:id/directo/recibido')
  @HttpCode(200)
  async recibidoDirecto(@UsuarioActual() yo: Usuario, @Param('id', ParseUUIDPipe) id: string) {
    return serializar(await this.pagos.recibidoDirecto(yo, id));
  }

  @Post('pedidos/:id/pruebas/subida')
  @Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 30, ttl: 60_000 } })
  async subidaPrueba(@UsuarioActual() yo: Usuario, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SubidaPruebaDto) {
    return this.pagos.subidaPrueba(yo, id, dto);
  }

  @Post('pedidos/:id/pruebas')
  async prueba(@UsuarioActual() yo: Usuario, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PruebaDto) {
    return serializar(await this.pagos.registrarPrueba(yo, id, dto));
  }

  @Delete('pruebas/:id')
  @HttpCode(200)
  async quitarPrueba(@UsuarioActual() yo: Usuario, @Param('id', ParseUUIDPipe) id: string) {
    return this.pagos.quitarPrueba(yo, id);
  }

  /** Ver una prueba: URL firmada (archivo), token del video o el enlace. */
  @Get('pruebas/:id')
  async verPrueba(@UsuarioActual() yo: Usuario, @Param('id', ParseUUIDPipe) id: string) {
    return this.pagos.verPrueba(yo, id);
  }

  @Get('pedidos/:id/expediente')
  async expediente(@UsuarioActual() yo: Usuario, @Param('id', ParseUUIDPipe) id: string) {
    return serializar(await this.pagos.expediente(yo, id));
  }

  /** Paso del contrato v2 hecho en Stellar Lab (se pega el hash; la API lo verifica en la red). */
  @Post('pedidos/:id/fases/pasos')
  async pasoV2(@UsuarioActual() yo: Usuario, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PasoV2Dto) {
    return serializar(await this.pagos.declararV2(yo, id, { ...dto, funcion: dto.accion }));
  }

  /** Volver a leer el pedido en el contrato (botón "Actualizar desde la red"). */
  @Post('pedidos/:id/sincronizar')
  @HttpCode(200)
  async sincronizar(@UsuarioActual() yo: Usuario, @Param('id', ParseUUIDPipe) id: string) {
    await this.pagos.expediente(yo, id);
    await this.pagos.sincronizar(id);
    return { listo: true };
  }
}
