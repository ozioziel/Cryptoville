-- Cryptoville v2, fase 1: la cuenta es la persona (varias wallets) y la app lee la red de Stellar.
-- Todo es aditivo: no se borra ni se cambia ningún dato existente.

-- ---------------------------------------------------------------
-- 1. Wallets de cada cuenta
-- - "de_la_cuenta": la wallet con la que se creó la cuenta (su cuenta de Supabase Auth sale de ella; no se quita).
-- - "para_cobrar": donde cobra por defecto.
-- La columna "usuarios.direccion" se conserva (es la wallet de la cuenta).
-- ---------------------------------------------------------------
CREATE TABLE "wallets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "direccion" TEXT NOT NULL,
    "metodo" TEXT NOT NULL DEFAULT 'wallet',
    "de_la_cuenta" BOOLEAN NOT NULL DEFAULT false,
    "para_cobrar" BOOLEAN NOT NULL DEFAULT false,
    "agregada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wallets_direccion_key" ON "wallets"("direccion");
CREATE INDEX "wallets_usuario_id_idx" ON "wallets"("usuario_id");
-- Una sola wallet de la cuenta y una sola para cobrar por persona.
CREATE UNIQUE INDEX "wallets_una_de_la_cuenta" ON "wallets"("usuario_id") WHERE "de_la_cuenta";
CREATE UNIQUE INDEX "wallets_una_para_cobrar" ON "wallets"("usuario_id") WHERE "para_cobrar";

ALTER TABLE "wallets" ADD CONSTRAINT "wallets_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_direccion_check" CHECK ("direccion" ~ '^G[A-Z2-7]{55}$');
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_metodo_check" CHECK ("metodo" IN ('wallet', 'pollar', 'llave-prueba'));

-- Cada usuario que ya existe queda con su wallet actual como wallet de la cuenta y para cobrar.
INSERT INTO "wallets" ("usuario_id", "direccion", "metodo", "de_la_cuenta", "para_cobrar", "agregada_en")
SELECT "id", "direccion", 'wallet', true, true, "creado_en" FROM "usuarios"
ON CONFLICT ("direccion") DO NOTHING;

-- ---------------------------------------------------------------
-- 2. Direcciones de cada pedido en el contrato (con varias wallets, se fijan al pagar y al aceptar).
-- Si están vacías, se usa la wallet de la cuenta (como hasta ahora).
-- ---------------------------------------------------------------
ALTER TABLE "pedidos" ADD COLUMN "direccion_cliente" TEXT;
ALTER TABLE "pedidos" ADD COLUMN "direccion_proveedor" TEXT;
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_direccion_cliente_check" CHECK ("direccion_cliente" IS NULL OR "direccion_cliente" ~ '^G[A-Z2-7]{55}$');
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_direccion_proveedor_check" CHECK ("direccion_proveedor" IS NULL OR "direccion_proveedor" ~ '^G[A-Z2-7]{55}$');

-- ---------------------------------------------------------------
-- 3. Pasos verificados en la red (la API lee la transacción y la compara con el pedido).
-- ---------------------------------------------------------------
ALTER TABLE "pasos_pedido" ADD COLUMN "en_cadena" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "pasos_pedido" ADD COLUMN "ledger" INTEGER;

-- Transacciones que la API armó para que las firme la wallet de la persona.
-- Al recibirla firmada se comprueba que sea exactamente la misma (mismo hash).
CREATE TABLE "transacciones_preparadas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "pedido_id" UUID,
    "direccion" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "xdr" TEXT NOT NULL,
    "datos" JSONB NOT NULL DEFAULT '{}',
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_en" TIMESTAMPTZ(3) NOT NULL,
    "usada_en" TIMESTAMPTZ(3),

    CONSTRAINT "transacciones_preparadas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "transacciones_preparadas_hash_key" ON "transacciones_preparadas"("hash");
CREATE INDEX "transacciones_preparadas_usuario_id_idx" ON "transacciones_preparadas"("usuario_id");
ALTER TABLE "transacciones_preparadas" ADD CONSTRAINT "transacciones_preparadas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hasta dónde leyó la API los eventos de cada contrato.
CREATE TABLE "sincronizacion_cadena" (
    "clave" TEXT NOT NULL,
    "cursor" TEXT,
    "ledger" INTEGER,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sincronizacion_cadena_pkey" PRIMARY KEY ("clave")
);

-- ---------------------------------------------------------------
-- 4. RLS
-- - Las wallets de una cuenta solo las ve su dueño.
-- - Las transacciones preparadas y la sincronización no se leen desde la web.
-- ---------------------------------------------------------------
ALTER TABLE "wallets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transacciones_preparadas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sincronizacion_cadena" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON "wallets", "transacciones_preparadas", "sincronizacion_cadena" FROM anon, authenticated;
GRANT SELECT ON "wallets" TO authenticated;

CREATE POLICY "solo las propias" ON "wallets" FOR SELECT TO authenticated USING (usuario_id = auth.uid());
