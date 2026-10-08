-- Cryptoville v2, fase 4: portafolio (experiencia previa y proyectos) y proyectos adjuntos a las propuestas.
-- Todo es aditivo. Los límites están en packages/shared/src/reglas.ts (`portafolio`); la API los valida.

-- Ayuda para RLS: ¿la cuenta está suspendida? (su portafolio deja de verse; ella y el árbitro lo siguen viendo).
CREATE OR REPLACE FUNCTION public.esta_suspendida(p_usuario uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((SELECT suspendido FROM public.usuarios WHERE id = p_usuario), false);
$$;
REVOKE ALL ON FUNCTION public.esta_suspendida(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.esta_suspendida(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------
-- 1. Experiencia: puesto, lugar, fechas y descripción.
-- ---------------------------------------------------------------
CREATE TABLE "experiencias" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "puesto" TEXT NOT NULL,
    "lugar" TEXT NOT NULL,
    "desde" DATE NOT NULL,
    "hasta" DATE,
    "descripcion" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experiencias_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "experiencias_usuario_id_idx" ON "experiencias"("usuario_id");
ALTER TABLE "experiencias" ADD CONSTRAINT "experiencias_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "experiencias" ADD CONSTRAINT "experiencias_puesto_check" CHECK (char_length("puesto") BETWEEN 2 AND 80);
ALTER TABLE "experiencias" ADD CONSTRAINT "experiencias_lugar_check" CHECK (char_length("lugar") BETWEEN 2 AND 80);
ALTER TABLE "experiencias" ADD CONSTRAINT "experiencias_descripcion_check" CHECK ("descripcion" IS NULL OR char_length("descripcion") <= 600);
ALTER TABLE "experiencias" ADD CONSTRAINT "experiencias_fechas_check" CHECK ("hasta" IS NULL OR "hasta" >= "desde");

-- ---------------------------------------------------------------
-- 2. Proyectos: título, descripción, fecha, fotos (bucket "fotos"), enlaces y videos.
-- - enlaces: [{ "url": "https://…", "titulo": "…" }] (solo https).
-- - videos: [{ "tipo": "mux", "video_id": "…", "playback_id": "…" }] o [{ "tipo": "youtube" | "vimeo", "id": "…", "url": "https://…" }].
-- - destacado: se cuelga como cuadro en la pared del interior de sus locales.
-- - oculto: lo ocultó el equipo después de un reporte.
-- ---------------------------------------------------------------
CREATE TABLE "proyectos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "fecha" DATE,
    "fotos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "enlaces" JSONB NOT NULL DEFAULT '[]',
    "videos" JSONB NOT NULL DEFAULT '[]',
    "destacado" BOOLEAN NOT NULL DEFAULT false,
    "oculto" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proyectos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "proyectos_usuario_id_idx" ON "proyectos"("usuario_id");
ALTER TABLE "proyectos" ADD CONSTRAINT "proyectos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "proyectos" ADD CONSTRAINT "proyectos_titulo_check" CHECK (char_length("titulo") BETWEEN 3 AND 80);
ALTER TABLE "proyectos" ADD CONSTRAINT "proyectos_descripcion_check" CHECK (char_length("descripcion") BETWEEN 10 AND 2000);
ALTER TABLE "proyectos" ADD CONSTRAINT "proyectos_fotos_check" CHECK (cardinality("fotos") <= 8);
ALTER TABLE "proyectos" ADD CONSTRAINT "proyectos_enlaces_check" CHECK (jsonb_typeof("enlaces") = 'array' AND jsonb_array_length("enlaces") <= 8);
ALTER TABLE "proyectos" ADD CONSTRAINT "proyectos_videos_check" CHECK (jsonb_typeof("videos") = 'array' AND jsonb_array_length("videos") <= 8);

-- ---------------------------------------------------------------
-- 3. Propuestas a un «Se busca»: proyectos del portafolio que se adjuntan (hasta 5).
-- ---------------------------------------------------------------
ALTER TABLE "propuestas" ADD COLUMN "proyectos" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
ALTER TABLE "propuestas" ADD CONSTRAINT "propuestas_proyectos_check" CHECK (cardinality("proyectos") <= 5);

-- ---------------------------------------------------------------
-- 4. RLS: el portafolio es público (salvo lo oculto y las cuentas suspendidas). La web nunca escribe.
-- ---------------------------------------------------------------
ALTER TABLE "experiencias" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "proyectos" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "experiencias", "proyectos" FROM anon, authenticated;
GRANT SELECT ON "experiencias", "proyectos" TO anon, authenticated;

CREATE POLICY "lectura publica" ON "experiencias" FOR SELECT TO anon, authenticated
  USING (NOT public.esta_suspendida(usuario_id) OR usuario_id = auth.uid() OR public.es_arbitro());
CREATE POLICY "lectura publica" ON "proyectos" FOR SELECT TO anon, authenticated
  USING ((NOT oculto AND NOT public.esta_suspendida(usuario_id)) OR usuario_id = auth.uid() OR public.es_arbitro());
