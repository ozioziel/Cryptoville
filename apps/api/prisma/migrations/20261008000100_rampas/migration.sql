-- Cryptoville v2: rampas (pasar de bolivianos a USDC con el QR del banco, y de USDC a la cuenta del banco).
-- Cryptoville nunca recibe ni guarda dinero: lo hace un proveedor de cambio con licencia (rampa).
-- En testnet la rampa es SIMULADA (RAMPA_SIMULADA=si): ver docs/simulaciones.md.

CREATE TABLE "rampas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    -- entrada: bolivianos → USDC (pagar con el QR del banco) · salida: USDC → cuenta del banco
    "sentido" TEXT NOT NULL,
    -- simulada (solo testnet) | pollar
    "proveedor" TEXT NOT NULL,
    "pais" TEXT NOT NULL,
    "moneda" TEXT NOT NULL,
    "monto_usdc" DECIMAL(20,7) NOT NULL,
    "monto_local" DECIMAL(20,2) NOT NULL,
    "tipo_cambio" DECIMAL(20,6) NOT NULL,
    "comision_local" DECIMAL(20,2) NOT NULL DEFAULT 0,
    -- Wallet que recibe el USDC (entrada) o que lo manda (salida).
    "direccion" TEXT NOT NULL,
    -- Pedido que se quiere pagar con esta recarga (opcional).
    "pedido_id" UUID,
    -- esperando_pago | acreditada | esperando_envio | enviada | vencida | fallida
    "estado" TEXT NOT NULL,
    -- Código que la persona ve y que va en el QR (no es un dato bancario).
    "referencia" TEXT NOT NULL,
    "qr_payload" TEXT,
    -- Salida: banco y solo los últimos 4 dígitos de la cuenta (nunca el número completo).
    "banco" TEXT,
    "cuenta_final" TEXT,
    -- Transacción de Stellar: el USDC que llegó (entrada) o el que se mandó (salida).
    "tx_hash" TEXT,
    "expira_en" TIMESTAMPTZ(3) NOT NULL,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rampas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "rampas_referencia_key" ON "rampas"("referencia");
CREATE UNIQUE INDEX "rampas_tx_hash_key" ON "rampas"("tx_hash");
CREATE INDEX "rampas_usuario_id_idx" ON "rampas"("usuario_id");
CREATE INDEX "rampas_pedido_id_idx" ON "rampas"("pedido_id");
ALTER TABLE "rampas" ADD CONSTRAINT "rampas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rampas" ADD CONSTRAINT "rampas_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "rampas" ADD CONSTRAINT "rampas_sentido_check" CHECK ("sentido" IN ('entrada', 'salida'));
ALTER TABLE "rampas" ADD CONSTRAINT "rampas_proveedor_check" CHECK ("proveedor" IN ('simulada', 'pollar'));
ALTER TABLE "rampas" ADD CONSTRAINT "rampas_estado_check" CHECK ("estado" IN ('esperando_pago', 'acreditada', 'esperando_envio', 'enviada', 'vencida', 'fallida'));
ALTER TABLE "rampas" ADD CONSTRAINT "rampas_monto_check" CHECK ("monto_usdc" > 0 AND "monto_local" > 0 AND "tipo_cambio" > 0);
ALTER TABLE "rampas" ADD CONSTRAINT "rampas_direccion_check" CHECK ("direccion" ~ '^G[A-Z2-7]{55}$');
ALTER TABLE "rampas" ADD CONSTRAINT "rampas_cuenta_final_check" CHECK ("cuenta_final" IS NULL OR "cuenta_final" ~ '^[0-9]{1,4}$');
ALTER TABLE "rampas" ADD CONSTRAINT "rampas_tx_hash_check" CHECK ("tx_hash" IS NULL OR "tx_hash" ~ '^[0-9a-f]{64}$');

-- RLS: cada persona ve sus recargas y retiros; el árbitro, todos. La web nunca escribe.
ALTER TABLE "rampas" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "rampas" FROM anon, authenticated;
GRANT SELECT ON "rampas" TO authenticated;
CREATE POLICY "dueno y arbitro" ON "rampas" FOR SELECT TO authenticated
  USING (usuario_id = auth.uid() OR public.es_arbitro());

-- Realtime: la pantalla del QR se entera sola cuando llega el pago.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "rampas";
  END IF;
END $$;
