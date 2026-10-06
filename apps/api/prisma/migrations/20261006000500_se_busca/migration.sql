-- «Se busca»: quien necesita un servicio lo publica y los proveedores le mandan propuestas.
-- Al elegir una propuesta, la API crea un pedido ya aceptado (con un servicio inactivo del proveedor),
-- así el resto del camino es el de siempre: pago en garantía, entrega, disputas y reseñas.
-- Todo es aditivo: no se toca ningún dato existente.

-- ---------------------------------------------------------------
-- 1. Tablas
-- ---------------------------------------------------------------
CREATE TYPE "EstadoBusqueda" AS ENUM ('abierta', 'asignada', 'cancelada');
CREATE TYPE "EstadoPropuesta" AS ENUM ('enviada', 'aceptada', 'rechazada', 'retirada');

CREATE TABLE "busquedas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "autor_id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "barrio" "Barrio" NOT NULL,
    "categoria" TEXT NOT NULL,
    "presupuesto_usdc" DECIMAL(20,7) NOT NULL,
    "fecha_limite" TIMESTAMPTZ(3) NOT NULL,
    "estado" "EstadoBusqueda" NOT NULL DEFAULT 'abierta',
    "total_propuestas" INTEGER NOT NULL DEFAULT 0,
    "pedido_id" UUID,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "busquedas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "propuestas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "busqueda_id" UUID NOT NULL,
    "proveedor_id" UUID NOT NULL,
    "monto_usdc" DECIMAL(20,7) NOT NULL,
    "dias_entrega" INTEGER NOT NULL,
    "mensaje" TEXT NOT NULL,
    "estado" "EstadoPropuesta" NOT NULL DEFAULT 'enviada',
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "propuestas_pkey" PRIMARY KEY ("id")
);

-- Un servicio puede nacer de una propuesta; un aviso puede referirse a un «Se busca».
ALTER TABLE "servicios" ADD COLUMN "busqueda_id" UUID;
ALTER TABLE "avisos" ADD COLUMN "busqueda_id" UUID;

CREATE UNIQUE INDEX "busquedas_pedido_id_key" ON "busquedas"("pedido_id");
CREATE INDEX "busquedas_estado_barrio_idx" ON "busquedas"("estado", "barrio");
CREATE INDEX "busquedas_autor_id_idx" ON "busquedas"("autor_id");
CREATE UNIQUE INDEX "propuestas_busqueda_id_proveedor_id_key" ON "propuestas"("busqueda_id", "proveedor_id");
CREATE INDEX "propuestas_proveedor_id_idx" ON "propuestas"("proveedor_id");

ALTER TABLE "busquedas" ADD CONSTRAINT "busquedas_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "busquedas" ADD CONSTRAINT "busquedas_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "propuestas" ADD CONSTRAINT "propuestas_busqueda_id_fkey" FOREIGN KEY ("busqueda_id") REFERENCES "busquedas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "propuestas" ADD CONSTRAINT "propuestas_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_busqueda_id_fkey" FOREIGN KEY ("busqueda_id") REFERENCES "busquedas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_busqueda_id_fkey" FOREIGN KEY ("busqueda_id") REFERENCES "busquedas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------
-- 2. Validaciones (las mismas que la API: LIMITES_SE_BUSCA en packages/shared)
-- ---------------------------------------------------------------
ALTER TABLE "busquedas" ADD CONSTRAINT "busquedas_titulo_check" CHECK (char_length("titulo") BETWEEN 3 AND 60);
ALTER TABLE "busquedas" ADD CONSTRAINT "busquedas_descripcion_check" CHECK (char_length("descripcion") BETWEEN 10 AND 1000);
ALTER TABLE "busquedas" ADD CONSTRAINT "busquedas_presupuesto_check" CHECK ("presupuesto_usdc" > 0);
ALTER TABLE "busquedas" ADD CONSTRAINT "busquedas_total_check" CHECK ("total_propuestas" >= 0);
-- Misma lista de categorías por villa que "locales_categoria_check" (y BARRIOS en packages/shared).
ALTER TABLE "busquedas" ADD CONSTRAINT "busquedas_categoria_check" CHECK (
     ("barrio" = 'creativo' AND "categoria" IN ('diseno-grafico', 'ilustracion', 'animacion', 'ui-ux', 'branding'))
  OR ("barrio" = 'tech' AND "categoria" IN ('desarrollo-web', 'desarrollo-movil', 'backend', 'videojuegos', 'automatizacion'))
  OR ("barrio" = 'audiovisual' AND "categoria" IN ('fotografia', 'edicion-video', 'musica', 'cine', 'sonido'))
  OR ("barrio" = 'academy' AND "categoria" IN ('cursos', 'mentorias', 'idiomas', 'programacion', 'diseno'))
);
ALTER TABLE "propuestas" ADD CONSTRAINT "propuestas_monto_check" CHECK ("monto_usdc" > 0);
ALTER TABLE "propuestas" ADD CONSTRAINT "propuestas_dias_check" CHECK ("dias_entrega" BETWEEN 1 AND 90);
ALTER TABLE "propuestas" ADD CONSTRAINT "propuestas_mensaje_check" CHECK (char_length("mensaje") BETWEEN 10 AND 1000);

-- ---------------------------------------------------------------
-- 3. RLS: la web solo lee; escribe la API.
-- - Los «Se busca» son públicos (como los servicios).
-- - Las propuestas las ven solo quien publicó el «Se busca», quien la mandó y el árbitro.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.es_autor_busqueda(p_busqueda uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.busquedas b WHERE b.id = p_busqueda AND b.autor_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.es_autor_busqueda(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.es_autor_busqueda(uuid) TO anon, authenticated;

ALTER TABLE "busquedas"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "propuestas" ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON "busquedas", "propuestas" FROM anon, authenticated;
GRANT SELECT ON "busquedas", "propuestas" TO anon, authenticated;

CREATE POLICY "lectura publica" ON "busquedas" FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "autor, proveedor y arbitro" ON "propuestas" FOR SELECT TO authenticated
  USING (proveedor_id = auth.uid() OR public.es_autor_busqueda(busqueda_id) OR public.es_arbitro());

-- ---------------------------------------------------------------
-- 4. Realtime: la web refresca los carteles y las propuestas en vivo (respeta RLS).
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "busquedas", "propuestas";
  END IF;
END $$;
