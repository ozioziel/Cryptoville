-- Cryptoville v2, fase 2: KYC (una persona = una cuenta), reportar y bloquear, y avisos fuera de la app.
-- Todo es aditivo.

-- ---------------------------------------------------------------
-- 1. KYC
-- - Se guarda solo el estado, el proveedor, la fecha y una HUELLA (HMAC) del documento.
-- - Nunca se guardan fotos ni el número de documento.
-- - "usuarios.verificado" es público: es la insignia ✔ junto al nombre.
-- ---------------------------------------------------------------
CREATE TABLE "verificaciones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "proveedor" TEXT NOT NULL DEFAULT 'didit',
    "sesion_id" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "huella" TEXT,
    "verificada_en" TIMESTAMPTZ(3),
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verificaciones_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "verificaciones_usuario_id_key" ON "verificaciones"("usuario_id");
CREATE UNIQUE INDEX "verificaciones_huella_key" ON "verificaciones"("huella");
CREATE UNIQUE INDEX "verificaciones_sesion_id_key" ON "verificaciones"("sesion_id");
ALTER TABLE "verificaciones" ADD CONSTRAINT "verificaciones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "verificaciones" ADD CONSTRAINT "verificaciones_estado_check" CHECK ("estado" IN ('pendiente', 'en_revision', 'aprobada', 'rechazada', 'duplicada'));

ALTER TABLE "usuarios" ADD COLUMN "verificado" BOOLEAN NOT NULL DEFAULT false;
-- Cuenta suspendida por el equipo (después de un reporte): no puede entrar ni escribir.
ALTER TABLE "usuarios" ADD COLUMN "suspendido" BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------
-- 2. Reportes y bloqueos
-- ---------------------------------------------------------------
CREATE TABLE "reportes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "autor_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "objeto_id" TEXT NOT NULL,
    "denunciado_id" UUID,
    "motivo" TEXT NOT NULL,
    "detalle" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'abierto',
    "resolucion" TEXT,
    "revisado_por" UUID,
    "revisado_en" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reportes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "reportes_estado_idx" ON "reportes"("estado", "creado_en");
CREATE INDEX "reportes_denunciado_id_idx" ON "reportes"("denunciado_id");
-- Una persona reporta una sola vez el mismo contenido.
CREATE UNIQUE INDEX "reportes_autor_tipo_objeto_key" ON "reportes"("autor_id", "tipo", "objeto_id");
ALTER TABLE "reportes" ADD CONSTRAINT "reportes_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reportes" ADD CONSTRAINT "reportes_denunciado_id_fkey" FOREIGN KEY ("denunciado_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reportes" ADD CONSTRAINT "reportes_tipo_check" CHECK ("tipo" IN ('local', 'foto', 'busqueda', 'resena', 'mensaje', 'persona', 'proyecto', 'chat'));
ALTER TABLE "reportes" ADD CONSTRAINT "reportes_estado_check" CHECK ("estado" IN ('abierto', 'descartado', 'resuelto'));
ALTER TABLE "reportes" ADD CONSTRAINT "reportes_motivo_check" CHECK ("motivo" IN ('estafa', 'ofensivo', 'spam', 'ilegal', 'suplantacion', 'derechos', 'otro'));

CREATE TABLE "bloqueos" (
    "usuario_id" UUID NOT NULL,
    "bloqueado_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bloqueos_pkey" PRIMARY KEY ("usuario_id", "bloqueado_id")
);
CREATE INDEX "bloqueos_bloqueado_id_idx" ON "bloqueos"("bloqueado_id");
ALTER TABLE "bloqueos" ADD CONSTRAINT "bloqueos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bloqueos" ADD CONSTRAINT "bloqueos_bloqueado_id_fkey" FOREIGN KEY ("bloqueado_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bloqueos" ADD CONSTRAINT "bloqueos_distintos_check" CHECK ("usuario_id" <> "bloqueado_id");

-- ---------------------------------------------------------------
-- 3. Avisos fuera de la app (notificaciones del navegador y correo)
-- ---------------------------------------------------------------
CREATE TABLE "preferencias_avisos" (
    "usuario_id" UUID NOT NULL,
    "correo" TEXT,
    "correo_verificado" BOOLEAN NOT NULL DEFAULT false,
    "token_correo" TEXT,
    "por_correo" BOOLEAN NOT NULL DEFAULT false,
    "por_push" BOOLEAN NOT NULL DEFAULT true,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "preferencias_avisos_pkey" PRIMARY KEY ("usuario_id")
);
CREATE UNIQUE INDEX "preferencias_avisos_token_correo_key" ON "preferencias_avisos"("token_correo");
ALTER TABLE "preferencias_avisos" ADD CONSTRAINT "preferencias_avisos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "preferencias_avisos" ADD CONSTRAINT "preferencias_avisos_correo_check" CHECK ("correo" IS NULL OR "correo" ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$');

CREATE TABLE "suscripciones_push" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suscripciones_push_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "suscripciones_push_endpoint_key" ON "suscripciones_push"("endpoint");
CREATE INDEX "suscripciones_push_usuario_id_idx" ON "suscripciones_push"("usuario_id");
ALTER TABLE "suscripciones_push" ADD CONSTRAINT "suscripciones_push_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Recordatorios ya enviados (para no mandar dos veces el mismo "vence mañana").
CREATE TABLE "recordatorios" (
    "clave" TEXT NOT NULL,
    "enviado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recordatorios_pkey" PRIMARY KEY ("clave")
);

-- ---------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------
ALTER TABLE "verificaciones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reportes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bloqueos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "preferencias_avisos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "suscripciones_push" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recordatorios" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON "verificaciones", "reportes", "bloqueos", "preferencias_avisos", "suscripciones_push", "recordatorios" FROM anon, authenticated;
GRANT SELECT ON "reportes", "bloqueos" TO authenticated;

-- La huella nunca sale de la base: la web solo ve su propio estado (todas las columnas menos la huella).
GRANT SELECT ("id", "usuario_id", "proveedor", "estado", "verificada_en", "creada_en", "actualizada_en") ON "verificaciones" TO authenticated;
CREATE POLICY "solo la propia" ON "verificaciones" FOR SELECT TO authenticated USING (usuario_id = auth.uid());

CREATE POLICY "autor y equipo" ON "reportes" FOR SELECT TO authenticated USING (autor_id = auth.uid() OR public.es_arbitro());
CREATE POLICY "solo los propios" ON "bloqueos" FOR SELECT TO authenticated USING (usuario_id = auth.uid());

-- El token del correo tampoco sale de la base.
GRANT SELECT ("usuario_id", "correo", "correo_verificado", "por_correo", "por_push", "actualizado_en") ON "preferencias_avisos" TO authenticated;
CREATE POLICY "solo las propias" ON "preferencias_avisos" FOR SELECT TO authenticated USING (usuario_id = auth.uid());

-- Realtime: el estado del KYC cambia en vivo cuando llega la respuesta de Didit.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "verificaciones";
  END IF;
END $$;
