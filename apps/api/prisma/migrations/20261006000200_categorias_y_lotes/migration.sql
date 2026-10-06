-- Categoría de cada local y lotes sin tope por villa.

-- ---------------------------------------------------------------
-- 1. Categoría: una de las categorías de su villa.
-- Mismas listas que BARRIOS en packages/shared/src/types/index.ts: si cambias una, cambia la otra.
-- Los locales existentes reciben la primera categoría de su villa.
-- ---------------------------------------------------------------
ALTER TABLE "locales" ADD COLUMN "categoria" TEXT;

UPDATE "locales" SET "categoria" = CASE "barrio"
  WHEN 'creativo' THEN 'diseno-grafico'
  WHEN 'tech' THEN 'desarrollo-web'
  WHEN 'audiovisual' THEN 'fotografia'
  WHEN 'academy' THEN 'cursos'
END;

ALTER TABLE "locales" ALTER COLUMN "categoria" SET NOT NULL;

ALTER TABLE "locales" ADD CONSTRAINT "locales_categoria_check" CHECK (
     ("barrio" = 'creativo' AND "categoria" IN ('diseno-grafico', 'ilustracion', 'animacion', 'ui-ux', 'branding'))
  OR ("barrio" = 'tech' AND "categoria" IN ('desarrollo-web', 'desarrollo-movil', 'backend', 'videojuegos', 'automatizacion'))
  OR ("barrio" = 'audiovisual' AND "categoria" IN ('fotografia', 'edicion-video', 'musica', 'cine', 'sonido'))
  OR ("barrio" = 'academy' AND "categoria" IN ('cursos', 'mentorias', 'idiomas', 'programacion', 'diseno'))
);

-- ---------------------------------------------------------------
-- 2. Lotes sin tope: cada villa numera sus lotes desde 1.
-- Los números actuales se conservan (las casas no cambian de lugar dentro de su villa)
-- y la API reutiliza los huecos al abrir locales nuevos.
-- ---------------------------------------------------------------
ALTER TABLE "locales" DROP CONSTRAINT "locales_lote_check";
ALTER TABLE "locales" ADD CONSTRAINT "locales_lote_check" CHECK ("lote" >= 1);

DROP INDEX "locales_lote_key";
CREATE UNIQUE INDEX "locales_barrio_lote_key" ON "locales"("barrio", "lote");
