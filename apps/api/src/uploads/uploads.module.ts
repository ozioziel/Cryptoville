import { Body, Controller, InternalServerErrorException, Module, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, Max, Min } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { Inject } from '@nestjs/common';
import { SesionGuard } from '../common/sesion.guard';
import { UsuarioActual } from '../common/usuario-actual';
import { CONFIGURACION, type Configuracion } from '../config/configuracion';
import type { Usuario } from '../generated/prisma/client';
import { SupabaseService } from '../supabase/supabase.service';

const TIPOS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } as const;
export const TAMANO_MAXIMO = 2 * 1024 * 1024;

class SubidaDto {
  @IsIn(Object.keys(TIPOS), { message: 'Solo se aceptan imágenes PNG, JPG o WEBP' })
  tipo: keyof typeof TIPOS;

  @IsInt()
  @Min(1)
  @Max(TAMANO_MAXIMO, { message: 'La imagen puede pesar hasta 2 MB' })
  tamano: number;
}

/**
 * Entrega una URL firmada para subir UNA foto al bucket "fotos" de Supabase Storage.
 * El bucket además limita el tamaño (2 MB) y el tipo de archivo, así que no se puede saltar.
 */
@Controller('uploads')
@UseGuards(SesionGuard)
export class UploadsController {
  constructor(
    private readonly supabase: SupabaseService,
    @Inject(CONFIGURACION) private readonly config: Configuracion,
  ) {}

  @Post('foto')
  async foto(@UsuarioActual() yo: Usuario, @Body() dto: SubidaDto) {
    const ruta = `usuarios/${yo.id}/${randomUUID()}.${TIPOS[dto.tipo]}`;
    const { data, error } = await this.supabase.admin.storage.from(this.supabase.bucketFotos).createSignedUploadUrl(ruta);
    if (error || !data) throw new InternalServerErrorException('No se pudo preparar la subida');
    return {
      ruta,
      token: data.token,
      url_subida: data.signedUrl.replace(this.config.supabase.url, this.config.supabase.urlPublica),
      url_publica: `${this.config.supabase.urlPublica}/storage/v1/object/public/${this.supabase.bucketFotos}/${ruta}`,
    };
  }
}

@Module({ controllers: [UploadsController] })
export class UploadsModule {}
