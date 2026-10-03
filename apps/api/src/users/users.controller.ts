import { Body, Controller, Get, Module, Patch, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { AVATARES } from '@cryptoville/shared';
import { SesionGuard } from '../common/sesion.guard';
import { serializar } from '../common/serializar';
import { UsuarioActual } from '../common/usuario-actual';
import type { Usuario } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

class PerfilDto {
  @IsOptional()
  @IsString()
  @Length(2, 40, { message: 'El nombre debe tener entre 2 y 40 caracteres' })
  nombre?: string;

  @IsOptional()
  @IsString()
  @Length(0, 280, { message: 'La presentación puede tener hasta 280 caracteres' })
  bio?: string;

  @IsOptional()
  @IsIn([...AVATARES], { message: 'Elige uno de los personajes disponibles' })
  avatar?: number;
}

@Controller('yo')
@UseGuards(SesionGuard)
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async yo(@UsuarioActual() yo: Usuario) {
    const local = await this.prisma.local.findUnique({ where: { usuario_id: yo.id } });
    return serializar({ usuario: yo, local });
  }

  @Patch()
  async actualizar(@UsuarioActual() yo: Usuario, @Body() dto: PerfilDto) {
    const usuario = await this.prisma.usuario.update({
      where: { id: yo.id },
      data: {
        nombre: dto.nombre?.trim(),
        bio: dto.bio === undefined ? undefined : dto.bio.trim() || null,
        avatar: dto.avatar,
      },
    });
    return serializar(usuario);
  }
}

@Module({ controllers: [UsersController] })
export class UsersModule {}
