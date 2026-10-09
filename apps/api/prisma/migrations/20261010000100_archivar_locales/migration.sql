-- Eliminar un local = archivarlo, para no romper el historial de sus pedidos (fase 3 del plan de correcciones).
-- Un local archivado deja de verse (también queda activo = false), libera su lote y, si era un local pagado,
-- su pago vuelve a servir para abrir otro. Sin pérdida de datos: los locales que ya existen quedan sin archivar.

ALTER TABLE "locales" ADD COLUMN "archivado_en" TIMESTAMPTZ(3);

-- El lote solo es único entre los locales que siguen en la villa: el de un local archivado queda libre.
DROP INDEX "locales_barrio_lote_key";
CREATE UNIQUE INDEX "locales_barrio_lote_key" ON "locales"("barrio", "lote") WHERE "archivado_en" IS NULL;
CREATE INDEX "locales_archivado_en_idx" ON "locales"("archivado_en");

-- La lectura pública de los locales sigue igual a propósito: los pedidos terminados muestran el nombre del
-- local aunque se haya archivado. La villa, el buscador y «Mis locales» filtran los archivados (activo = false
-- y archivado_en IS NULL).
