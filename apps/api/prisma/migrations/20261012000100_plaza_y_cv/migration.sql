-- La Plaza principal (CVs de usuarios), fase 7 del plan de correcciones. Todo es aditivo y sin pérdida de datos.
-- Los topes están en packages/shared/src/reglas.ts (`cv`); la API los valida.

-- ---------------------------------------------------------------
-- 1. El edificio de cada persona en la Plaza: `usuarios.lote_plaza`.
-- Lo asigna la API al abrir el primer local (primer lote libre) y lo libera al archivar el último.
-- ---------------------------------------------------------------
ALTER TABLE "usuarios" ADD COLUMN "lote_plaza" INTEGER;
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_lote_plaza_check" CHECK ("lote_plaza" IS NULL OR "lote_plaza" >= 1);
CREATE UNIQUE INDEX "usuarios_lote_plaza_key" ON "usuarios"("lote_plaza") WHERE "lote_plaza" IS NOT NULL;

-- Backfill: quien ya tiene al menos un local activo recibe su edificio, en el orden en que abrió su primer local.
UPDATE "usuarios" u
SET "lote_plaza" = x.n
FROM (
  SELECT "usuario_id", row_number() OVER (ORDER BY min("creado_en"), "usuario_id") AS n
  FROM "locales"
  WHERE "archivado_en" IS NULL AND "activo"
  GROUP BY "usuario_id"
) x
WHERE u."id" = x."usuario_id";

-- ---------------------------------------------------------------
-- 2. Secciones del CV en `experiencias`: experiencia (las que ya existen), educación, licencias y
-- certificaciones, premios y voluntariado. Más un enlace (la credencial) y si es público.
-- ---------------------------------------------------------------
ALTER TABLE "experiencias" ADD COLUMN "tipo" TEXT NOT NULL DEFAULT 'trabajo';
ALTER TABLE "experiencias" ADD COLUMN "enlace" TEXT;
ALTER TABLE "experiencias" ADD COLUMN "publico" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "experiencias" ADD CONSTRAINT "experiencias_tipo_check" CHECK ("tipo" IN ('trabajo', 'educacion', 'certificacion', 'premio', 'voluntariado'));
ALTER TABLE "experiencias" ADD CONSTRAINT "experiencias_enlace_check" CHECK ("enlace" IS NULL OR ("enlace" ~ '^https://[^\s]+$' AND char_length("enlace") <= 500));
CREATE INDEX "experiencias_usuario_id_tipo_idx" ON "experiencias"("usuario_id", "tipo");

-- Los proyectos también se pueden dejar privados (solo los ve su dueña).
ALTER TABLE "proyectos" ADD COLUMN "publico" BOOLEAN NOT NULL DEFAULT true;

DROP POLICY IF EXISTS "lectura publica" ON "experiencias";
CREATE POLICY "lectura publica" ON "experiencias" FOR SELECT TO anon, authenticated
  USING ((publico AND NOT public.esta_suspendida(usuario_id)) OR usuario_id = auth.uid() OR public.es_arbitro());
DROP POLICY IF EXISTS "lectura publica" ON "proyectos";
CREATE POLICY "lectura publica" ON "proyectos" FOR SELECT TO anon, authenticated
  USING ((publico AND NOT oculto AND NOT public.esta_suspendida(usuario_id)) OR usuario_id = auth.uid() OR public.es_arbitro());

-- ---------------------------------------------------------------
-- 3. `cvs`: acerca de mí, habilidades, idiomas y el PDF, cada parte con su «público».
-- La tabla es privada (la dueña y el árbitro). Los demás leen la vista `cvs_publicos`, que deja vacío
-- lo que no es público: así lo privado no sale de la base (RLS no puede esconder columnas).
-- ---------------------------------------------------------------
CREATE TABLE "cvs" (
    "usuario_id" UUID NOT NULL,
    "acerca_de" TEXT,
    "acerca_publico" BOOLEAN NOT NULL DEFAULT true,
    "habilidades" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "habilidades_publicas" BOOLEAN NOT NULL DEFAULT true,
    "idiomas" JSONB NOT NULL DEFAULT '[]',
    "idiomas_publicos" BOOLEAN NOT NULL DEFAULT true,
    "pdf_ruta" TEXT,
    "pdf_publico" BOOLEAN NOT NULL DEFAULT true,
    "oculto" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cvs_pkey" PRIMARY KEY ("usuario_id")
);
ALTER TABLE "cvs" ADD CONSTRAINT "cvs_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cvs" ADD CONSTRAINT "cvs_acerca_de_check" CHECK ("acerca_de" IS NULL OR char_length("acerca_de") <= 2000);
ALTER TABLE "cvs" ADD CONSTRAINT "cvs_habilidades_check" CHECK (cardinality("habilidades") <= 30);
ALTER TABLE "cvs" ADD CONSTRAINT "cvs_idiomas_check" CHECK (jsonb_typeof("idiomas") = 'array' AND jsonb_array_length("idiomas") <= 10);
-- El PDF vive en el bucket `cvs`, en la carpeta de su dueña: «<usuario>/<uuid>.pdf».
ALTER TABLE "cvs" ADD CONSTRAINT "cvs_pdf_ruta_check" CHECK ("pdf_ruta" IS NULL OR "pdf_ruta" ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$');

ALTER TABLE "cvs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "cvs" FROM anon, authenticated;
GRANT SELECT ON "cvs" TO authenticated;
CREATE POLICY "duena y arbitro" ON "cvs" FOR SELECT TO authenticated USING (usuario_id = auth.uid() OR public.es_arbitro());

-- Vista pública (como `reputacion`): corre con los permisos de su dueño, así que no aplica la RLS de `cvs`
-- y solo expone lo que la persona marcó como público. Lo oculto por el equipo y las cuentas suspendidas no salen.
CREATE OR REPLACE VIEW public.cvs_publicos AS
SELECT
  c.usuario_id,
  CASE WHEN c.acerca_publico THEN c.acerca_de END AS acerca_de,
  CASE WHEN c.habilidades_publicas THEN c.habilidades ELSE ARRAY[]::TEXT[] END AS habilidades,
  CASE WHEN c.idiomas_publicos THEN c.idiomas ELSE '[]'::jsonb END AS idiomas,
  CASE WHEN c.pdf_publico THEN c.pdf_ruta END AS pdf_ruta,
  c.actualizado_en
FROM public.cvs c
WHERE NOT c.oculto AND NOT public.esta_suspendida(c.usuario_id);
REVOKE ALL ON public.cvs_publicos FROM anon, authenticated;
GRANT SELECT ON public.cvs_publicos TO anon, authenticated;

-- El CV se puede reportar (lo oculta el equipo).
ALTER TABLE "reportes" DROP CONSTRAINT "reportes_tipo_check";
ALTER TABLE "reportes" ADD CONSTRAINT "reportes_tipo_check" CHECK ("tipo" IN ('local', 'foto', 'busqueda', 'resena', 'mensaje', 'persona', 'proyecto', 'chat', 'trabajo_publico', 'cv'));

-- ---------------------------------------------------------------
-- 4. Storage: bucket público `cvs` (máx. 5 MB, solo PDF). Las subidas solo se hacen con URLs firmadas
-- que entrega NestJS. Al subirlo, la web avisa que el CV será público.
-- ---------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('cvs', 'cvs', true, 5242880, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
