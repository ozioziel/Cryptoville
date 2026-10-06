import { BadRequestException, Body, Controller, Get, Module, Patch, UseGuards } from '@nestjs/common';
import { IsIn, IsObject, IsOptional, IsString, Length, ValidateIf } from 'class-validator';
import { AVATARES, validarAparienciaPersona } from '@cryptoville/shared';
import { SesionGuard } from '../common/sesion.guard';
import { serializar } from '../common/serializar';
import { UsuarioActual } from '../common/usuario-actual';
import { Prisma, type Usuario } from '../generated/prisma/client';
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

  /** Personaje de Kenney (se sigue aceptando; si no hay `apariencia`, se dibuja la persona equivalente). */
  @IsOptional()
  @IsIn([...AVATARES], { message: 'Elige uno de los personajes disponibles' })
  avatar?: number;

  /** Persona en vectores, validada contra el catálogo de packages/shared. `null` vuelve al personaje de `avatar`. */
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsObject({ message: 'La apariencia del personaje debe ser un objeto' })
  apariencia?: Record<string, unknown> | null;
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
    let apariencia: Prisma.InputJsonValue | typeof Prisma.DbNull | undefined;
    if (dto.apariencia === null) apariencia = Prisma.DbNull;
    else if (dto.apariencia !== undefined) {
      const r = validarAparienciaPersona(dto.apariencia);
      if (!r.ok) throw new BadRequestException(r.error);
      apariencia = { ...r.valor };
    }
    const usuario = await this.prisma.usuario.update({
      where: { id: yo.id },
      data: {
        nombre: dto.nombre?.trim(),
        bio: dto.bio === undefined ? undefined : dto.bio.trim() || null,
        avatar: dto.avatar,
        apariencia,
      },
    });
    return serializar(usuario);
  }
}

@Module({ controllers: [UsersController] })
export class UsersModule {}
