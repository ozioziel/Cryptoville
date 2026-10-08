-- Cryptoville v2, fase 4: varios locales por persona, pago del local extra y propuestas con local y plan.
-- Todo es aditivo y sin perder datos: los locales que ya existen quedan como el local principal de cada persona.

-- ---------------------------------------------------------------
-- 1. Locales: una persona puede tener varios (hasta 3 gratis; más, con un pago único; tope en reglas.ts).
-- El "local principal" es el más antiguo (lo usa PUT /api/mi-local, que sigue funcionando igual).
-- ---------------------------------------------------------------
DROP INDEX IF EXISTS "locales_usuario_id_key";
CREATE INDEX "locales_usuario_id_idx" ON "locales"("usuario_id");

-- ---------------------------------------------------------------
-- 2. Pagos a la plataforma (por ahora, solo el local extra).
-- Es una transferencia de USDC a la tesorería, verificada en la red (o declarada, si el servidor no verifica).
-- Cada transacción sirve una sola vez; al abrir el local extra, el pago queda atado a ese local.
-- ---------------------------------------------------------------
CREATE TABLE "pagos_plataforma" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "concepto" TEXT NOT NULL,
    "monto_usdc" DECIMAL(20,7) NOT NULL,
    "tx_hash" TEXT NOT NULL,
    "red" TEXT NOT NULL,
    "direccion" TEXT NOT NULL,
    "verificado" BOOLEAN NOT NULL DEFAULT false,
    "local_id" UUID,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagos_plataforma_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "pagos_plataforma_tx_hash_key" ON "pagos_plataforma"("tx_hash");
CREATE UNIQUE INDEX "pagos_plataforma_local_id_key" ON "pagos_plataforma"("local_id");
CREATE INDEX "pagos_plataforma_usuario_id_idx" ON "pagos_plataforma"("usuario_id");
ALTER TABLE "pagos_plataforma" ADD CONSTRAINT "pagos_plataforma_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pagos_plataforma" ADD CONSTRAINT "pagos_plataforma_local_id_fkey" FOREIGN KEY ("local_id") REFERENCES "locales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pagos_plataforma" ADD CONSTRAINT "pagos_plataforma_concepto_check" CHECK ("concepto" IN ('local_extra'));
ALTER TABLE "pagos_plataforma" ADD CONSTRAINT "pagos_plataforma_monto_check" CHECK ("monto_usdc" > 0);
ALTER TABLE "pagos_plataforma" ADD CONSTRAINT "pagos_plataforma_tx_hash_check" CHECK ("tx_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "pagos_plataforma" ADD CONSTRAINT "pagos_plataforma_red_check" CHECK ("red" IN ('testnet', 'mainnet'));

-- ---------------------------------------------------------------
-- 3. Propuestas a un «Se busca»: desde qué local se propone y, si se quiere, el plan de fases.
-- `plan` es la misma lista que valida `validarPlan` (packages/shared/src/pagos.ts); la valida la API.
-- Las propuestas que ya existen quedan con el único local que tenía su proveedor.
-- ---------------------------------------------------------------
ALTER TABLE "propuestas" ADD COLUMN "local_id" UUID;
ALTER TABLE "propuestas" ADD COLUMN "plan" JSONB;
ALTER TABLE "propuestas" ADD CONSTRAINT "propuestas_local_id_fkey" FOREIGN KEY ("local_id") REFERENCES "locales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "propuestas" ADD CONSTRAINT "propuestas_plan_check" CHECK ("plan" IS NULL OR jsonb_typeof("plan") = 'array');
CREATE INDEX "propuestas_local_id_idx" ON "propuestas"("local_id");

UPDATE "propuestas" p
SET "local_id" = l."id"
FROM "locales" l
WHERE l."usuario_id" = p."proveedor_id" AND p."local_id" IS NULL;

-- ---------------------------------------------------------------
-- 4. RLS: cada persona ve sus pagos a la plataforma; el árbitro, todos. La web nunca escribe.
-- ---------------------------------------------------------------
ALTER TABLE "pagos_plataforma" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "pagos_plataforma" FROM anon, authenticated;
GRANT SELECT ON "pagos_plataforma" TO authenticated;
CREATE POLICY "dueno y arbitro" ON "pagos_plataforma" FOR SELECT TO authenticated
  USING (usuario_id = auth.uid() OR public.es_arbitro());
