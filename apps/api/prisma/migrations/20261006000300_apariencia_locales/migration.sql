-- Casas personalizables por fuera y por dentro, con piezas de su villa
-- (CATALOGO_CASA en packages/shared/src/apariencia.ts; la API valida las piezas).
-- Si "apariencia" está vacía, se usa la casa por defecto de la villa.
-- El campo "color" se sigue usando para el toldo, la puerta y el letrero.
-- RLS: la política "lectura publica" de locales ya cubre la columna nueva; nadie escribe desde la web.
ALTER TABLE "locales" ADD COLUMN "apariencia" JSONB;

ALTER TABLE "locales"
  ADD CONSTRAINT "locales_apariencia_check" CHECK ("apariencia" IS NULL OR jsonb_typeof("apariencia") = 'object');
