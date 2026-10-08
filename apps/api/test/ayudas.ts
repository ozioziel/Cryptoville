// Ayudas para las pruebas de punta a punta de Cryptoville v2 (contra Supabase local: `npm run setup` antes).
// Cada archivo de pruebas llama a `usarApp()`: levanta la API, y al terminar borra las cuentas que creó.
process.env.LOG_LEVEL = 'silent';
import './sin-servicios';

import type { INestApplication } from '@nestjs/common';
import { Keypair } from '@stellar/stellar-sdk';
import { createClient } from '@supabase/supabase-js';
import request from 'supertest';
import { firmarMensajeSep53 } from '../src/auth/firma-stellar';
import { crearApp } from '../src/main';
import { PrismaService } from '../src/prisma/prisma.service';
import { SupabaseService } from '../src/supabase/supabase.service';

export interface Sesion {
  par: Keypair;
  token: string;
  id: string;
}

export interface Contexto {
  app: INestApplication;
  prisma: PrismaService;
  http: () => ReturnType<typeof request>;
  entrar(par?: Keypair, metodo?: string): Promise<Sesion>;
  /** Suma `nueva` a la cuenta de `s` (la wallet nueva firma el mensaje). */
  vincular(s: Sesion, nueva: Keypair): Promise<request.Response>;
  /** Cuenta con rol de árbitro (el equipo). */
  equipo(): Promise<Sesion>;
  /** Abre un local con un servicio y devuelve sus ids. */
  localConServicio(s: Sesion, barrio?: string, precio?: string): Promise<{ localId: string; servicioId: string }>;
}

export const con = (s: Sesion) => ({ Authorization: `Bearer ${s.token}` });

export const clienteCon = (token?: string) =>
  createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  });

/** Registra beforeAll/afterAll y devuelve el contexto (se llena antes de la primera prueba). */
export function usarApp(): Contexto {
  const creados: Sesion[] = [];
  const ctx = {} as Contexto;

  beforeAll(async () => {
    const { app } = await crearApp();
    await app.init();
    ctx.app = app;
    ctx.prisma = app.get(PrismaService);
    ctx.http = () => request(app.getHttpServer());
    ctx.entrar = async (par = Keypair.random(), metodo?: string) => {
      const d = await ctx.http().post('/api/auth/desafio').send({ direccion: par.publicKey() }).expect(200);
      const firma = firmarMensajeSep53(par, d.body.mensaje);
      const v = await ctx
        .http()
        .post('/api/auth/verificar')
        .send({ direccion: par.publicKey(), nonce: d.body.nonce, firma, ...(metodo ? { metodo } : {}) })
        .expect(200);
      const sesion = { par, token: v.body.access_token as string, id: v.body.usuario.id as string };
      if (!creados.some((c) => c.id === sesion.id)) creados.push(sesion);
      return sesion;
    };
    ctx.vincular = async (s, nueva) => {
      const d = await ctx.http().post('/api/wallets/desafio').set(con(s)).send({ direccion: nueva.publicKey() }).expect(200);
      return ctx
        .http()
        .post('/api/wallets/vincular')
        .set(con(s))
        .send({ direccion: nueva.publicKey(), nonce: d.body.nonce, firma: firmarMensajeSep53(nueva, d.body.mensaje) });
    };
    ctx.equipo = async () => {
      const s = await ctx.entrar();
      await ctx.prisma.usuario.update({ where: { id: s.id }, data: { rol: 'arbitro' } });
      return s;
    };
    ctx.localConServicio = async (s, barrio = 'academy', precio = '8') => {
      await ctx.http().put('/api/mi-local').set(con(s)).send({ nombre: 'Local de prueba v2', barrio }).expect(200);
      const sv = await ctx
        .http()
        .post('/api/servicios')
        .set(con(s))
        .send({ titulo: 'Servicio', descripcion: 'Una descripción suficientemente larga', precio_usdc: precio, dias_entrega: 2 })
        .expect(201);
      const local = await ctx.prisma.local.findFirstOrThrow({ where: { usuario_id: s.id }, orderBy: { creado_en: 'desc' } });
      return { localId: local.id, servicioId: sv.body.id as string };
    };
  });

  afterAll(async () => {
    const ids = creados.map((s) => s.id);
    await ctx.prisma.pedido.deleteMany({ where: { OR: [{ cliente_id: { in: ids } }, { proveedor_id: { in: ids } }] } });
    const supa = ctx.app.get(SupabaseService);
    for (const id of ids) await supa.admin.auth.admin.deleteUser(id);
    await ctx.app.close();
  });

  return ctx;
}
