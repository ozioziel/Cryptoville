// Configuración de la CLI de Prisma (migraciones y seed).
// Lee el .env de la raíz del monorepo. Las migraciones usan DIRECT_URL (conexión directa,
// sin pooler); la app en ejecución usa DATABASE_URL (ver src/prisma/prisma.service.ts).
import { config as cargarEnv } from 'dotenv';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

cargarEnv({ path: path.resolve(__dirname, '../../.env'), quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
  },
});
