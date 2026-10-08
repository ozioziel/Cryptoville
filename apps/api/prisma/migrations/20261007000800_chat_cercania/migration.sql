-- Cryptoville v2, fase 4: personas en línea y chat por cercanía.
-- - Los mensajes se mandan por la API (con límite de frecuencia y bloqueos) y se guardan 7 días
--   (`chatCercania.diasGuardado` en packages/shared/src/reglas.ts), solo para revisar reportes.
--   La API los borra sola después; los que tienen un reporte abierto se guardan hasta que el equipo lo revise.
-- - Las posiciones NO se guardan: viajan por Supabase Realtime (Presence y Broadcast) en un canal privado
--   por villa y sector («villa:creativo:1»), al que solo entran personas con sesión.

CREATE TABLE "mensajes_cercania" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "de_id" UUID NOT NULL,
    "para_id" UUID NOT NULL,
    "texto" TEXT NOT NULL,
    "oculto" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensajes_cercania_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "mensajes_cercania_de_id_para_id_creado_en_idx" ON "mensajes_cercania"("de_id", "para_id", "creado_en");
CREATE INDEX "mensajes_cercania_para_id_creado_en_idx" ON "mensajes_cercania"("para_id", "creado_en");
CREATE INDEX "mensajes_cercania_creado_en_idx" ON "mensajes_cercania"("creado_en");
ALTER TABLE "mensajes_cercania" ADD CONSTRAINT "mensajes_cercania_de_id_fkey" FOREIGN KEY ("de_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mensajes_cercania" ADD CONSTRAINT "mensajes_cercania_para_id_fkey" FOREIGN KEY ("para_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mensajes_cercania" ADD CONSTRAINT "mensajes_cercania_texto_check" CHECK (char_length("texto") BETWEEN 1 AND 280);
ALTER TABLE "mensajes_cercania" ADD CONSTRAINT "mensajes_cercania_distintos_check" CHECK ("de_id" <> "para_id");

-- RLS: los mensajes los ven las dos personas de la conversación (los ocultos, solo el árbitro). La web nunca escribe.
ALTER TABLE "mensajes_cercania" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "mensajes_cercania" FROM anon, authenticated;
GRANT SELECT ON "mensajes_cercania" TO authenticated;
CREATE POLICY "las dos personas y el arbitro" ON "mensajes_cercania" FOR SELECT TO authenticated
  USING ((auth.uid() IN (de_id, para_id) AND NOT oculto) OR public.es_arbitro());

-- Realtime: a quien le escriben le llega el mensaje en vivo (respeta RLS).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "mensajes_cercania";
  END IF;
END $$;

-- Canales privados de Realtime («villa:<villa>:<sector>»): solo entran personas con sesión,
-- para Presence (quién está) y Broadcast (posiciones). Si el proyecto no tiene Realtime Authorization, se omite.
DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "villa: leer con sesion" ON realtime.messages';
    EXECUTE 'DROP POLICY IF EXISTS "villa: enviar con sesion" ON realtime.messages';
    EXECUTE $p$CREATE POLICY "villa: leer con sesion" ON realtime.messages FOR SELECT TO authenticated
      USING (realtime.topic() LIKE 'villa:%' AND extension IN ('presence', 'broadcast') AND NOT public.esta_suspendida(auth.uid()))$p$;
    EXECUTE $p$CREATE POLICY "villa: enviar con sesion" ON realtime.messages FOR INSERT TO authenticated
      WITH CHECK (realtime.topic() LIKE 'villa:%' AND extension IN ('presence', 'broadcast') AND NOT public.esta_suspendida(auth.uid()))$p$;
  END IF;
END $$;
