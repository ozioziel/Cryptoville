import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, Length, Matches } from 'class-validator';
import { serializar } from '../common/serializar';
import { AuthService } from './auth.service';

class DesafioDto {
  @Matches(/^G[A-Z2-7]{55}$/, { message: 'La dirección debe empezar con G y tener 56 caracteres' })
  direccion: string;
}

class VerificarDto extends DesafioDto {
  @Matches(/^[0-9a-f]{32}$/, { message: 'Código inválido' })
  nonce: string;

  @IsString()
  @Length(64, 200, { message: 'Firma inválida' })
  firma: string;
}

@Controller('auth')
// Más estricto que el general: 20 intentos por minuto por IP (sin límite en las pruebas).
@Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 20, ttl: 60_000 } })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Paso 1: mensaje para firmar con la wallet. */
  @Post('desafio')
  @HttpCode(200)
  desafio(@Body() dto: DesafioDto) {
    return this.auth.crearDesafio(dto.direccion);
  }

  /** Paso 2: firma del mensaje → sesión de Supabase. */
  @Post('verificar')
  @HttpCode(200)
  async verificar(@Body() dto: VerificarDto) {
    return serializar(await this.auth.verificar(dto.direccion, dto.nonce, dto.firma));
  }
}
