# Guía de Supabase (nube)

Supabase guarda los datos de la app (Postgres con RLS), envía los avisos y el chat en vivo (Realtime) y aloja las fotos (Storage). El plan gratuito alcanza para la demo.

> En desarrollo local no necesitas nada de esto: `npm run setup` levanta un Supabase local con Docker.

## 1. Crear el proyecto

1. Entra a <https://supabase.com> y crea una cuenta.
2. Pulsa **New project**:
   - **Name:** `cryptoville`;
   - **Database password:** genera una y **guárdala** (la necesitas para las cadenas de conexión);
   - **Region:** la más cercana a tus usuarios (por ejemplo, São Paulo o East US).
3. Espera 1–2 minutos a que el proyecto quede listo.

## 2. Copiar las llaves al `.env`

| Variable del `.env` | Dónde está en Supabase |
|---|---|
| `SUPABASE_URL` | **Project Settings → Data API → Project URL** (`https://xxxx.supabase.co`) |
| `SUPABASE_ANON_KEY` | **Project Settings → API Keys**: la llave **anon** (o **publishable**, `sb_publishable_…`). Es pública, la usa el navegador |
| `SUPABASE_SERVICE_ROLE_KEY` | **Project Settings → API Keys**: la llave **service_role** (o **secret**, `sb_secret_…`). **Secreta**: solo va en el `.env` del servidor |
| `DATABASE_URL` | Botón **Connect** (arriba) → **Transaction pooler** (puerto **6543**) |
| `DIRECT_URL` | Botón **Connect** → **Session pooler** (puerto **5432**) |

En las dos cadenas de conexión, reemplaza `[YOUR-PASSWORD]` por la contraseña de la base. Si la contraseña tiene caracteres especiales (`@`, `#`, `/`…), escríbelos codificados para URL, por ejemplo `@` → `%40`.

> Usa los **poolers**, no la conexión directa `db.xxxx.supabase.co`: esa solo funciona por IPv6, y muchos VPS (incluido Oracle) usan IPv4.

## 3. Configurar el inicio de sesión

Cryptoville no usa correo ni contraseña: la API verifica la firma de la wallet y crea la cuenta en Supabase Auth por su cuenta. Por eso:

1. **Authentication → Sign In / Providers**:
   - **Email** debe estar **activado**, porque la API lo usa internamente;
   - **Allow new users to sign up**: **desactivado**. Así nadie crea cuentas con la llave pública, y la API las sigue creando con la llave secreta.
2. **Authentication → Rate Limits**: sube **«Sign-ups and sign-ins»** a unos 300 por cada 5 minutos. Todos los inicios de sesión salen desde la IP del VPS, y el límite por defecto (30) se alcanza rápido.

## 4. Crear las tablas, la seguridad, Realtime y el bucket de fotos

Lo hacen las migraciones de Prisma (`apps/api/prisma/migrations`):
- crean las tablas;
- activan RLS (solo lectura para la web);
- crean la vista `reputacion`;
- agregan las tablas a Realtime;
- crean el bucket público `fotos` (2 MB, solo imágenes).

- **En el VPS:** `bash deploy/deploy.sh` aplica las migraciones automáticamente.
- **Desde tu PC:** necesitas un archivo con las variables de la nube. No pises tu `.env` local:

  ```bash
  cd apps/api
  DIRECT_URL="postgresql://postgres.xxxx:CLAVE@aws-0-REGION.pooler.supabase.com:5432/postgres" npx prisma migrate deploy
  ```

### Comprobar

| Dónde | Qué deberías ver |
|---|---|
| **Table Editor** | `usuarios`, `locales`, `servicios`, `pedidos`, `pasos_pedido`, `mensajes`, `disputas`, `resenas`, `avisos`, `desafios_login`, todas con el candado de RLS |
| **Storage** | El bucket `fotos`, marcado como público |
| **Database → Publications → supabase_realtime** | `mensajes`, `avisos`, `pedidos` y `pasos_pedido` |

Si el bucket no aparece, créalo a mano:
- **Name:** `fotos`;
- **Public bucket:** sí;
- **File size limit:** 2 MB;
- **Allowed MIME types:** `image/png, image/jpeg, image/webp`.

## 5. Datos de ejemplo (opcional)

Para cargar los 5 usuarios de ejemplo con sus locales, servicios y pedidos:

- **En el VPS:** copia tu `.seed-keys.json` a la raíz del proyecto y ejecuta `bash deploy/deploy.sh --con-ejemplo`.
- **Desde tu PC:** con las variables de la nube en el entorno, ejecuta `npm run db:seed`.

El seed **no borra datos reales**: si encuentra usuarios que no son de ejemplo, se detiene.

## Tener en cuenta

| Tema | Qué saber |
|---|---|
| Pausa por inactividad | El plan gratuito **pausa el proyecto tras 7 días sin uso**. Se reactiva desde el panel con **Restore project**. Antes de una demo, entra a revisar |
| Respaldos | El plan gratuito no trae respaldos descargables. El contenedor `backups` del VPS guarda uno diario en `deploy/backups/` (7 días) |
| Llave secreta | Si la `service_role` o `secret` se filtra, rótala en **Project Settings → API Keys** y actualiza el `.env` |
| `AUTH_PASSWORD_SECRET` | No lo cambies después de tener usuarios: es lo que permite que cada wallet vuelva a entrar a su cuenta |
