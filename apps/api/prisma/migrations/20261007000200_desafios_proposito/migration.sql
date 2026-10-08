-- Los desafíos firmados tienen un propósito: entrar o sumar una wallet a una cuenta.
-- Así un mensaje firmado para una cosa no sirve para la otra.
ALTER TABLE "desafios_login" ADD COLUMN "proposito" TEXT NOT NULL DEFAULT 'entrar';
ALTER TABLE "desafios_login" ADD COLUMN "usuario_id" UUID;
ALTER TABLE "desafios_login" ADD CONSTRAINT "desafios_login_proposito_check" CHECK ("proposito" IN ('entrar', 'vincular'));
