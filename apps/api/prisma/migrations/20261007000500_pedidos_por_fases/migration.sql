-- Cryptoville v2, fase 3: métodos de pago, pedidos por fases (contrato v2), pruebas y videos (Mux).
-- Todo es aditivo: los pedidos que ya existen quedan como "garantia" en el contrato "v1".

-- ---------------------------------------------------------------
-- 1. Método de pago y contrato de cada pedido
-- ---------------------------------------------------------------
ALTER TABLE "pedidos" ADD COLUMN "metodo_pago" TEXT NOT NULL DEFAULT 'garantia';
ALTER TABLE "pedidos" ADD COLUMN "contrato" TEXT NOT NULL DEFAULT 'v1';
-- Por etapas: el cliente acepta el plan antes de pagar (o pide cambios con un comentario).
ALTER TABLE "pedidos" ADD COLUMN "plan_aceptado_en" TIMESTAMPTZ(3);
ALTER TABLE "pedidos" ADD COLUMN "plan_comentario" TEXT;
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_metodo_pago_check" CHECK ("metodo_pago" IN ('garantia', 'directo', 'etapas'));
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_contrato_check" CHECK ("contrato" IN ('v1', 'v2'));

-- Los pasos de las fases dicen de qué fase son (0 = la primera).
ALTER TABLE "pasos_pedido" ADD COLUMN "fase" INTEGER;

-- ---------------------------------------------------------------
-- 2. Fases (contrato v2). Antes de pagar están "propuesta"; después reflejan el contrato.
-- La disputa de una fase vive en la misma fila (cada fase puede tener la suya).
-- ---------------------------------------------------------------
CREATE TABLE "fases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pedido_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "descripcion" TEXT NOT NULL,
    "porcentaje_proyecto" INTEGER NOT NULL,
    "porcentaje_pago" INTEGER NOT NULL,
    "monto_usdc" DECIMAL(20,7) NOT NULL,
    "fecha_limite" TIMESTAMPTZ(3) NOT NULL,
    "pruebas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "estado" TEXT NOT NULL DEFAULT 'propuesta',
    "entregada_en" TIMESTAMPTZ(3),
    "huella" TEXT,
    "cambios" INTEGER NOT NULL DEFAULT 0,
    "disputa_desde" TIMESTAMPTZ(3),
    "abierta_por" UUID,
    "motivo_disputa" TEXT,
    "decision" TEXT,
    "ganador" TEXT,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fases_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "fases_pedido_id_numero_key" ON "fases"("pedido_id", "numero");
ALTER TABLE "fases" ADD CONSTRAINT "fases_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fases" ADD CONSTRAINT "fases_abierta_por_fkey" FOREIGN KEY ("abierta_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fases" ADD CONSTRAINT "fases_numero_check" CHECK ("numero" BETWEEN 0 AND 9);
ALTER TABLE "fases" ADD CONSTRAINT "fases_porcentajes_check" CHECK ("porcentaje_proyecto" BETWEEN 1 AND 100 AND "porcentaje_pago" BETWEEN 1 AND 100);
ALTER TABLE "fases" ADD CONSTRAINT "fases_monto_check" CHECK ("monto_usdc" > 0);
ALTER TABLE "fases" ADD CONSTRAINT "fases_estado_check" CHECK ("estado" IN ('propuesta', 'en_curso', 'entregada', 'liberada', 'reembolsada', 'en_disputa', 'resuelta'));
ALTER TABLE "fases" ADD CONSTRAINT "fases_ganador_check" CHECK ("ganador" IS NULL OR "ganador" IN ('Cliente', 'Proveedor', 'Mitad'));
ALTER TABLE "fases" ADD CONSTRAINT "fases_huella_check" CHECK ("huella" IS NULL OR "huella" ~ '^[0-9a-f]{64}$');
ALTER TABLE "fases" ADD CONSTRAINT "fases_pruebas_check" CHECK ("pruebas" <@ ARRAY['archivo', 'enlace', 'video']::TEXT[]);

-- ---------------------------------------------------------------
-- 3. Videos (Mux): pruebas de las fases y proyectos del portafolio.
-- Supabase solo guarda los ids de Mux; los videos de pruebas se reproducen con un token firmado.
-- ---------------------------------------------------------------
CREATE TABLE "videos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "uso" TEXT NOT NULL,
    "mux_upload_id" TEXT NOT NULL,
    "mux_asset_id" TEXT,
    "playback_id" TEXT,
    "politica" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'subiendo',
    "duracion_seg" DOUBLE PRECISION,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "videos_mux_upload_id_key" ON "videos"("mux_upload_id");
CREATE UNIQUE INDEX "videos_mux_asset_id_key" ON "videos"("mux_asset_id");
CREATE INDEX "videos_usuario_id_idx" ON "videos"("usuario_id");
ALTER TABLE "videos" ADD CONSTRAINT "videos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "videos" ADD CONSTRAINT "videos_uso_check" CHECK ("uso" IN ('prueba', 'portafolio'));
ALTER TABLE "videos" ADD CONSTRAINT "videos_politica_check" CHECK ("politica" IN ('signed', 'public'));
ALTER TABLE "videos" ADD CONSTRAINT "videos_estado_check" CHECK ("estado" IN ('subiendo', 'procesando', 'listo', 'error'));

-- ---------------------------------------------------------------
-- 4. Pruebas: lo que se entrega en cada fase (y lo que suben las partes en una disputa).
-- - archivo: en el bucket privado "pruebas"; huella = SHA-256 del archivo (la calcula la API).
-- - enlace: huella = SHA-256 del enlace.
-- - video: en Mux; huella = SHA-256 del id del video.
-- Al entregar la fase, las pruebas quedan "selladas" (ya no se pueden quitar).
-- ---------------------------------------------------------------
CREATE TABLE "pruebas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pedido_id" UUID NOT NULL,
    "fase" INTEGER NOT NULL,
    "autor_id" UUID NOT NULL,
    "para" TEXT NOT NULL DEFAULT 'entrega',
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "url" TEXT,
    "ruta" TEXT,
    "video_id" UUID,
    "mime" TEXT,
    "tamano" INTEGER,
    "huella" TEXT NOT NULL,
    "entrega" INTEGER NOT NULL DEFAULT 1,
    "sellada_en" TIMESTAMPTZ(3),
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pruebas_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "pruebas_pedido_id_fase_idx" ON "pruebas"("pedido_id", "fase");
ALTER TABLE "pruebas" ADD CONSTRAINT "pruebas_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pruebas" ADD CONSTRAINT "pruebas_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pruebas" ADD CONSTRAINT "pruebas_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pruebas" ADD CONSTRAINT "pruebas_tipo_check" CHECK ("tipo" IN ('archivo', 'enlace', 'video'));
ALTER TABLE "pruebas" ADD CONSTRAINT "pruebas_para_check" CHECK ("para" IN ('entrega', 'disputa'));
ALTER TABLE "pruebas" ADD CONSTRAINT "pruebas_huella_check" CHECK ("huella" ~ '^[0-9a-f]{64}$');
ALTER TABLE "pruebas" ADD CONSTRAINT "pruebas_url_check" CHECK ("url" IS NULL OR "url" ~ '^https://');
ALTER TABLE "pruebas" ADD CONSTRAINT "pruebas_titulo_check" CHECK (char_length("titulo") BETWEEN 1 AND 120);

-- ---------------------------------------------------------------
-- 5. Reputación: también cuentan las disputas de las fases (ganadas y perdidas; 50/50 no cuenta).
-- Misma vista de 20261007000450_ocultar_contenido con ese cambio.
-- ---------------------------------------------------------------
CREATE OR REPLACE VIEW public.reputacion AS
WITH notas AS (
  SELECT destinatario_id AS usuario_id,
         round(avg(calificacion)::numeric, 2) AS calificacion,
         count(*) AS total_resenas
  FROM public.resenas
  WHERE NOT oculta
  GROUP BY destinatario_id
),
completados AS (
  SELECT u.id AS usuario_id, count(p.id) AS completados
  FROM public.usuarios u
  LEFT JOIN public.pedidos p
    ON u.id IN (p.cliente_id, p.proveedor_id) AND p.estado IN ('liberado', 'resuelto', 'finalizado')
  GROUP BY u.id
),
resultados AS (
  SELECT p.cliente_id, p.proveedor_id, d.ganador::text AS ganador
  FROM public.disputas d JOIN public.pedidos p ON p.id = d.pedido_id
  WHERE d.ganador IS NOT NULL
  UNION ALL
  SELECT p.cliente_id, p.proveedor_id, f.ganador
  FROM public.fases f JOIN public.pedidos p ON p.id = f.pedido_id
  WHERE f.ganador IN ('Cliente', 'Proveedor')
),
disputas AS (
  SELECT u.id AS usuario_id,
         count(r.*) FILTER (
           WHERE (r.ganador = 'Cliente' AND r.cliente_id = u.id)
              OR (r.ganador = 'Proveedor' AND r.proveedor_id = u.id)
         ) AS ganadas,
         count(r.*) FILTER (
           WHERE (r.ganador = 'Cliente' AND r.proveedor_id = u.id)
              OR (r.ganador = 'Proveedor' AND r.cliente_id = u.id)
         ) AS perdidas
  FROM public.usuarios u
  LEFT JOIN resultados r ON u.id IN (r.cliente_id, r.proveedor_id)
  GROUP BY u.id
)
SELECT u.id AS usuario_id,
       n.calificacion,
       coalesce(n.total_resenas, 0)::int AS total_resenas,
       c.completados::int AS completados,
       d.ganadas::int AS disputas_ganadas,
       d.perdidas::int AS disputas_perdidas,
       CASE
         WHEN c.completados >= 10 AND coalesce(n.calificacion, 0) >= 4.5 THEN 'Destacado'
         WHEN c.completados >= 3 AND coalesce(n.calificacion, 0) >= 4 THEN 'Confiable'
         ELSE 'Nuevo'
       END AS nivel
FROM public.usuarios u
JOIN completados c ON c.usuario_id = u.id
JOIN disputas d ON d.usuario_id = u.id
LEFT JOIN notas n ON n.usuario_id = u.id;

REVOKE ALL ON public.reputacion FROM anon, authenticated;
GRANT SELECT ON public.reputacion TO anon, authenticated;

-- ---------------------------------------------------------------
-- 6. RLS: fases y pruebas las ven las partes del pedido y el árbitro. Los videos, su dueño
--    (y los del portafolio que están listos, cualquiera). La web nunca escribe.
-- ---------------------------------------------------------------
ALTER TABLE "fases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pruebas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "videos" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON "fases", "pruebas", "videos" FROM anon, authenticated;
GRANT SELECT ON "fases", "pruebas" TO authenticated;
GRANT SELECT ON "videos" TO anon, authenticated;

CREATE POLICY "participantes y arbitro" ON "fases" FOR SELECT TO authenticated USING (public.puede_ver_pedido(pedido_id));
CREATE POLICY "participantes y arbitro" ON "pruebas" FOR SELECT TO authenticated USING (public.puede_ver_pedido(pedido_id));
CREATE POLICY "dueno o portafolio publico" ON "videos" FOR SELECT TO anon, authenticated
  USING (usuario_id = auth.uid() OR (uso = 'portafolio' AND estado = 'listo'));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "fases", "pruebas";
  END IF;
END $$;

-- ---------------------------------------------------------------
-- 7. Storage: bucket PRIVADO "pruebas" (máx. 50 MB). Se sube y se lee con URLs firmadas de la API.
-- Mismos tipos que `archivos.pruebaTipos` en packages/shared/src/reglas.ts.
-- ---------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pruebas', 'pruebas', false, 52428800,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'application/zip', 'text/plain', 'audio/mpeg', 'audio/wav']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
