-- Moderación: el equipo puede OCULTAR una reseña o un mensaje reportado (no se borra: queda para revisar).
-- La reputación deja de contar las reseñas ocultas y cuenta como completados los pedidos "finalizado"
-- (pedidos por fases del contrato v2 y pagos directos que terminaron).

ALTER TABLE "resenas" ADD COLUMN "oculta" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "mensajes" ADD COLUMN "oculto" BOOLEAN NOT NULL DEFAULT false;

-- Misma vista de antes (20261003000100_seguridad_rls) con esos dos cambios.
-- Misma regla de niveles que packages/shared/src/reputation.ts.
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

-- Las reseñas ocultas no se leen desde la web.
DROP POLICY IF EXISTS "lectura publica" ON "resenas";
CREATE POLICY "lectura publica" ON "resenas" FOR SELECT TO anon, authenticated USING (NOT oculta OR public.es_arbitro());
-- Los mensajes ocultos solo los ve el árbitro.
DROP POLICY IF EXISTS "participantes y arbitro" ON "mensajes";
CREATE POLICY "participantes y arbitro" ON "mensajes" FOR SELECT TO authenticated
  USING ((public.puede_ver_pedido(pedido_id) AND NOT oculto) OR public.es_arbitro());
