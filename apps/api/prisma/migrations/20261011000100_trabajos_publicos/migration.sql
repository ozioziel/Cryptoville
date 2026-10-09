-- «Mis trabajos» (fase 6 del plan de correcciones): los trabajos terminados que una persona elige mostrar en su
-- perfil público («Trabajos verificados»). Todo es aditivo. El tope (6) está en packages/shared/src/reglas.ts.
--
-- Los pedidos son privados (RLS: solo las partes y el árbitro). Por eso aquí se copia solo lo que se muestra en
-- público: el título del servicio, la fecha en que terminó y la transacción que lo cerró. Nunca el monto ni el
-- detalle del pedido. Las estrellas salen de `resenas`, que ya es pública.

CREATE TABLE "trabajos_publicos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "pedido_id" UUID NOT NULL,
    "rol" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "terminado_en" TIMESTAMPTZ(3) NOT NULL,
    "tx_hash" TEXT,
    "oculto" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trabajos_publicos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "trabajos_publicos_usuario_id_pedido_id_key" ON "trabajos_publicos"("usuario_id", "pedido_id");
CREATE INDEX "trabajos_publicos_pedido_id_idx" ON "trabajos_publicos"("pedido_id");
ALTER TABLE "trabajos_publicos" ADD CONSTRAINT "trabajos_publicos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trabajos_publicos" ADD CONSTRAINT "trabajos_publicos_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trabajos_publicos" ADD CONSTRAINT "trabajos_publicos_rol_check" CHECK ("rol" IN ('proveedor', 'cliente'));
ALTER TABLE "trabajos_publicos" ADD CONSTRAINT "trabajos_publicos_titulo_check" CHECK (char_length("titulo") BETWEEN 1 AND 120);
ALTER TABLE "trabajos_publicos" ADD CONSTRAINT "trabajos_publicos_tx_hash_check" CHECK ("tx_hash" IS NULL OR "tx_hash" ~ '^[0-9a-f]{64}$');

-- Se puede reportar (lo oculta el equipo).
ALTER TABLE "reportes" DROP CONSTRAINT "reportes_tipo_check";
ALTER TABLE "reportes" ADD CONSTRAINT "reportes_tipo_check" CHECK ("tipo" IN ('local', 'foto', 'busqueda', 'resena', 'mensaje', 'persona', 'proyecto', 'chat', 'trabajo_publico'));

-- RLS: lectura pública (salvo lo oculto y las cuentas suspendidas; la persona y el árbitro lo siguen viendo).
-- La web nunca escribe: todo pasa por POST y DELETE /api/trabajos-publicos.
ALTER TABLE "trabajos_publicos" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "trabajos_publicos" FROM anon, authenticated;
GRANT SELECT ON "trabajos_publicos" TO anon, authenticated;
CREATE POLICY "lectura publica" ON "trabajos_publicos" FOR SELECT TO anon, authenticated
  USING ((NOT oculto AND NOT public.esta_suspendida(usuario_id)) OR usuario_id = auth.uid() OR public.es_arbitro());
