-- Cada «Se busca» es una casa en el modo «Quiero trabajar» de su villa.
-- El número de lote define dónde está esa casa y no cambia mientras siga abierto.
-- La API asigna el primer número libre entre los «Se busca» visibles de la villa (abiertos y sin vencer),
-- así los lugares de los que se cerraron o vencieron se vuelven a usar.
-- No es único en la base: un «Se busca» vencido conserva su número aunque ya no se vea.
ALTER TABLE "busquedas" ADD COLUMN "lote" INTEGER NOT NULL DEFAULT 1;

-- Los «Se busca» que ya existen reciben números seguidos dentro de su villa, por antigüedad.
UPDATE "busquedas" b SET "lote" = n.numero
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "barrio" ORDER BY "creado_en", "id") AS numero
  FROM "busquedas"
) n
WHERE b."id" = n."id";

ALTER TABLE "busquedas" ADD CONSTRAINT "busquedas_lote_check" CHECK ("lote" >= 1);
CREATE INDEX "busquedas_barrio_lote_idx" ON "busquedas"("barrio", "lote");
