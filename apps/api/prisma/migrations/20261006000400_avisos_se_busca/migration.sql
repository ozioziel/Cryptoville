-- Avisos nuevos para los «Se busca» (propuestas). Los valores se usan desde la migración siguiente
-- y desde la API (Postgres no deja usar un valor nuevo de un enum en la misma transacción).
ALTER TYPE "TipoAviso" ADD VALUE IF NOT EXISTS 'nueva_propuesta';
ALTER TYPE "TipoAviso" ADD VALUE IF NOT EXISTS 'propuesta_aceptada';
ALTER TYPE "TipoAviso" ADD VALUE IF NOT EXISTS 'busqueda_cerrada';
