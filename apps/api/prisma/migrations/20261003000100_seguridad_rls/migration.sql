-- Seguridad de Cryptoville en Supabase.
--
-- Regla de la app: la web LEE de Supabase (llave anon + RLS) y ESCRIBE a través de NestJS.
-- NestJS se conecta como dueño de las tablas (Prisma), por eso no le afecta RLS.
-- Aquí: llaves foráneas a auth.users, validaciones, RLS de solo lectura, vista de reputación,
-- Realtime para chat y avisos, y el bucket de fotos.

-- ---------------------------------------------------------------
-- 1. Usuarios ligados a Supabase Auth
-- ---------------------------------------------------------------
ALTER TABLE "usuarios"
  ADD CONSTRAINT "usuarios_auth_fkey" FOREIGN KEY ("id") REFERENCES auth.users ("id") ON DELETE CASCADE;

-- ---------------------------------------------------------------
-- 2. Validaciones que también cumple la base de datos
-- ---------------------------------------------------------------
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_direccion_check" CHECK ("direccion" ~ '^G[A-Z2-7]{55}$');
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_nombre_check" CHECK (char_length("nombre") BETWEEN 2 AND 40);
ALTER TABLE "locales" ADD CONSTRAINT "locales_lote_check" CHECK ("lote" BETWEEN 1 AND 12);
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_precio_check" CHECK ("precio_usdc" > 0);
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_dias_check" CHECK ("dias_entrega" BETWEEN 1 AND 90);
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_monto_check" CHECK ("monto_usdc" > 0);
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_partes_check" CHECK ("cliente_id" <> "proveedor_id");
ALTER TABLE "pasos_pedido" ADD CONSTRAINT "pasos_hash_check" CHECK ("hash" IS NULL OR "hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "resenas" ADD CONSTRAINT "resenas_calificacion_check" CHECK ("calificacion" BETWEEN 1 AND 5);

-- ---------------------------------------------------------------
-- 3. ¿El usuario de la sesión es árbitro?
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.es_arbitro()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.rol = 'arbitro'
  );
$$;

-- ¿El usuario de la sesión participa en el pedido (o es árbitro)?
CREATE OR REPLACE FUNCTION public.puede_ver_pedido(p_pedido uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pedidos p
    WHERE p.id = p_pedido AND (auth.uid() IN (p.cliente_id, p.proveedor_id))
  ) OR public.es_arbitro();
$$;

REVOKE ALL ON FUNCTION public.es_arbitro() FROM public;
REVOKE ALL ON FUNCTION public.puede_ver_pedido(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.es_arbitro() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.puede_ver_pedido(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------
-- 4. RLS: todo cerrado salvo las lecturas permitidas
-- ---------------------------------------------------------------
ALTER TABLE "usuarios"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "desafios_login" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "locales"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "servicios"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pedidos"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pasos_pedido"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mensajes"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "disputas"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "resenas"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "avisos"         ENABLE ROW LEVEL SECURITY;

-- La web nunca escribe directo: se quitan los permisos de escritura a anon y authenticated.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON TABLE "desafios_login" FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon, authenticated;

-- Público: perfiles, locales, servicios y reseñas.
CREATE POLICY "lectura publica" ON "usuarios"  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "lectura publica" ON "locales"   FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "lectura publica" ON "servicios" FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "lectura publica" ON "resenas"   FOR SELECT TO anon, authenticated USING (true);

-- Privado: solo los participantes del pedido y el árbitro.
CREATE POLICY "participantes y arbitro" ON "pedidos" FOR SELECT TO authenticated
  USING (auth.uid() IN (cliente_id, proveedor_id) OR public.es_arbitro());
CREATE POLICY "participantes y arbitro" ON "pasos_pedido" FOR SELECT TO authenticated
  USING (public.puede_ver_pedido(pedido_id));
CREATE POLICY "participantes y arbitro" ON "mensajes" FOR SELECT TO authenticated
  USING (public.puede_ver_pedido(pedido_id));
CREATE POLICY "participantes y arbitro" ON "disputas" FOR SELECT TO authenticated
  USING (public.puede_ver_pedido(pedido_id));

-- Avisos: cada quien los suyos.
CREATE POLICY "solo los propios" ON "avisos" FOR SELECT TO authenticated
  USING (usuario_id = auth.uid());

-- ---------------------------------------------------------------
-- 5. Reputación (vista pública con datos agregados)
-- Misma regla de niveles que packages/shared/src/reputation.ts.
-- ---------------------------------------------------------------
CREATE OR REPLACE VIEW public.reputacion AS
WITH notas AS (
  SELECT destinatario_id AS usuario_id,
         round(avg(calificacion)::numeric, 2) AS calificacion,
         count(*) AS total_resenas
  FROM public.resenas
  GROUP BY destinatario_id
),
completados AS (
  SELECT u.id AS usuario_id, count(p.id) AS completados
  FROM public.usuarios u
  LEFT JOIN public.pedidos p
    ON u.id IN (p.cliente_id, p.proveedor_id) AND p.estado IN ('liberado', 'resuelto')
  GROUP BY u.id
),
disputas AS (
  SELECT u.id AS usuario_id,
         count(*) FILTER (
           WHERE (d.ganador = 'Cliente' AND p.cliente_id = u.id)
              OR (d.ganador = 'Proveedor' AND p.proveedor_id = u.id)
         ) AS ganadas,
         count(*) FILTER (
           WHERE (d.ganador = 'Cliente' AND p.proveedor_id = u.id)
              OR (d.ganador = 'Proveedor' AND p.cliente_id = u.id)
         ) AS perdidas
  FROM public.usuarios u
  LEFT JOIN public.pedidos p ON u.id IN (p.cliente_id, p.proveedor_id)
  LEFT JOIN public.disputas d ON d.pedido_id = p.id AND d.ganador IS NOT NULL
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
-- 6. Realtime: chat, avisos y cambios de pedidos (respeta RLS)
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "mensajes", "avisos", "pedidos", "pasos_pedido";
  END IF;
END $$;

-- ---------------------------------------------------------------
-- 7. Storage: bucket público "fotos" (máx. 2 MB, solo imágenes).
-- Las subidas solo se hacen con URLs firmadas que entrega NestJS.
-- ---------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('fotos', 'fotos', true, 2097152, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
