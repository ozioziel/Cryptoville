-- Cryptoville v2, fase 1: aceptación de los documentos legales y el botón «Enviar comentarios».

-- ---------------------------------------------------------------
-- 1. Quién aceptó qué documento y en qué versión (packages/shared/src/legal.ts).
-- ---------------------------------------------------------------
CREATE TABLE "aceptaciones_legales" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "documento" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "aceptado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aceptaciones_legales_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "aceptaciones_legales_usuario_documento_version_key" ON "aceptaciones_legales"("usuario_id", "documento", "version");
ALTER TABLE "aceptaciones_legales" ADD CONSTRAINT "aceptaciones_legales_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------
-- 2. Comentarios: ideas y errores que la gente manda al equipo.
-- ---------------------------------------------------------------
CREATE TABLE "comentarios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID,
    "tipo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "contexto" TEXT,
    "captura_ruta" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'nuevo',
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comentarios_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "comentarios_estado_idx" ON "comentarios"("estado", "creado_en");
ALTER TABLE "comentarios" ADD CONSTRAINT "comentarios_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "comentarios" ADD CONSTRAINT "comentarios_tipo_check" CHECK ("tipo" IN ('idea', 'error', 'otro'));
ALTER TABLE "comentarios" ADD CONSTRAINT "comentarios_estado_check" CHECK ("estado" IN ('nuevo', 'visto', 'resuelto'));
ALTER TABLE "comentarios" ADD CONSTRAINT "comentarios_texto_check" CHECK (char_length("texto") BETWEEN 5 AND 2000);

-- ---------------------------------------------------------------
-- 3. RLS: cada quien ve lo suyo; el árbitro (equipo) ve todos los comentarios.
-- ---------------------------------------------------------------
ALTER TABLE "aceptaciones_legales" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "comentarios" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON "aceptaciones_legales", "comentarios" FROM anon, authenticated;
GRANT SELECT ON "aceptaciones_legales", "comentarios" TO authenticated;

CREATE POLICY "solo las propias" ON "aceptaciones_legales" FOR SELECT TO authenticated USING (usuario_id = auth.uid());
CREATE POLICY "autor y equipo" ON "comentarios" FOR SELECT TO authenticated USING (usuario_id = auth.uid() OR public.es_arbitro());

-- ---------------------------------------------------------------
-- 4. Storage: bucket PRIVADO "capturas" (máx. 2 MB, solo imágenes) para las capturas de los comentarios.
-- Se sube con una URL firmada que entrega la API; solo el equipo las abre (también con URL firmada).
-- ---------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('capturas', 'capturas', false, 2097152, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
