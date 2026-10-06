-- Personajes en vectores: cada usuario puede armar su persona con piezas del catálogo
-- (packages/shared/src/apariencia.ts). La API valida las piezas; aquí solo se exige un objeto.
--
-- La columna "avatar" (personaje de Kenney) se conserva: si "apariencia" está vacía,
-- la web dibuja la persona equivalente a ese personaje (APARIENCIA_POR_AVATAR).
-- RLS: la política "lectura publica" de usuarios ya cubre la columna nueva; nadie escribe desde la web.
ALTER TABLE "usuarios" ADD COLUMN "apariencia" JSONB;

ALTER TABLE "usuarios"
  ADD CONSTRAINT "usuarios_apariencia_check" CHECK ("apariencia" IS NULL OR jsonb_typeof("apariencia") = 'object');
