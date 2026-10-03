import { Global, Inject, Injectable, Module } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CONFIGURACION, type Configuracion } from '../config/configuracion';

/**
 * Acceso a Supabase desde el servidor.
 * - `admin` usa la llave service_role: SOLO existe aquí, nunca llega al navegador.
 * - `publico()` crea un cliente con la llave anon (para iniciar sesión en nombre del usuario).
 */
@Injectable()
export class SupabaseService {
  readonly admin: SupabaseClient;

  constructor(@Inject(CONFIGURACION) private readonly config: Configuracion) {
    this.admin = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  publico(): SupabaseClient {
    return createClient(this.config.supabase.url, this.config.supabase.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  get bucketFotos(): string {
    return 'fotos';
  }
}

@Global()
@Module({ providers: [SupabaseService], exports: [SupabaseService] })
export class SupabaseModule {}
