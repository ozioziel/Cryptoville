# Despliegue en el VPS de Oracle (Ubuntu)

Quedan corriendo tres contenedores:
- **caddy:** sirve la web y pone HTTPS;
- **api:** NestJS;
- **backups:** respaldo diario de la base.

La base de datos, el tiempo real y las fotos están en **Supabase (nube)**.

```
Internet → Caddy :80/:443 ─┬─ /      → web (React + Phaser)
                           └─ /api/* → API (NestJS) ──► Supabase
```

Antes de empezar necesitas:
- el proyecto de Supabase listo ([guia-supabase.md](guia-supabase.md));
- de forma opcional, los contratos en testnet ([guia-stellar-lab.md](guia-stellar-lab.md)). La app funciona sin ellos, pero sin el pago en garantía.

## Paso 1. Abrir los puertos en la nube de Oracle

Oracle bloquea el tráfico en **dos** lugares. Este paso abre el primero (la nube); el script del paso 3 abre el segundo (el firewall interno del servidor).

1. En la consola de Oracle Cloud: **Compute → Instances →** tu instancia.
2. En **Primary VNIC**, entra a la **Subnet** y luego a la **Security List** (normalmente *Default Security List…*).
3. Pulsa **Add Ingress Rules** y agrega dos reglas:

   | Source CIDR | IP Protocol | Destination Port Range |
   |---|---|---|
   | `0.0.0.0/0` | TCP | `80` |
   | `0.0.0.0/0` | TCP | `443` |

4. Opcional, para HTTP/3: una regla igual con protocolo **UDP** y puerto `443`.

## Paso 2. Llevar el proyecto al VPS

Entra por SSH (`ssh ubuntu@TU-IP`) y elige una opción:

- **Con git:**

  ```bash
  git clone https://github.com/ozioziel/Cryptoville.git
  cd Cryptoville
  ```

- **Sin git, desde tu PC:**

  ```bash
  scp -r Cryptoville ubuntu@TU-IP:~/
  ```

  No hace falta copiar `node_modules`.

## Paso 3. Preparar el servidor (una sola vez)

```bash
sudo bash deploy/setup-vps.sh
```

El script:
- instala Docker;
- abre los puertos 80 y 443 en el firewall interno (iptables) de forma permanente;
- crea 2 GB de swap si la máquina tiene poca memoria.

Al final muestra tu IP y la dirección **sslip.io** que te corresponde.

**Cierra la sesión SSH y vuelve a entrar** para poder usar `docker` sin `sudo`.

## Paso 4. Llenar el `.env`

```bash
cp .env.example .env
nano .env
```

| Variable | Valor |
|---|---|
| `PUBLIC_HOST` | Tu IP con guiones + `.sslip.io`, por ejemplo `140-238-10-25.sslip.io` (da HTTPS automático). Con la IP sola funciona solo por HTTP, y algunas wallets lo rechazan |
| `SUPABASE_*`, `DATABASE_URL`, `DIRECT_URL` | Ver [guia-supabase.md](guia-supabase.md) |
| `AUTH_PASSWORD_SECRET` | Genera uno con `openssl rand -hex 32` y **no lo cambies** después |
| `ESCROW_CONTRACT_ID`, `PAYMENT_TOKEN_ID`, `ARBITRO_DIRECCION` | Ver [guia-stellar-lab.md](guia-stellar-lab.md), paso 4 |

### Cómo funciona sslip.io

Es un servicio gratuito que convierte el nombre `140-238-10-25.sslip.io` en la IP `140.238.10.25`, sin registrar nada. Gracias a eso, Caddy puede pedir un certificado HTTPS gratuito a Let's Encrypt. Cuando compres un dominio, apúntalo a la IP del VPS y pon el dominio en `PUBLIC_HOST`.

## Paso 5. Desplegar

```bash
bash deploy/deploy.sh
```

El script:
1. revisa el `.env`;
2. construye las imágenes (la primera vez tarda unos 10 minutos en un Ampere gratuito);
3. aplica las migraciones en Supabase;
4. levanta todo y espera a que `/api/health` responda;
5. muestra la URL.

Para cargar también los usuarios de ejemplo, copia antes `.seed-keys.json` a la raíz del proyecto en el VPS y ejecuta:

```bash
bash deploy/deploy.sh --con-ejemplo
```

## Si el VPS es compartido (te dieron un solo puerto)

Si el servidor es de otra persona y ya tiene servicios en los puertos 80 y 443:

- **No ejecutes `setup-vps.sh`.** Cambia el firewall, instala paquetes y crea swap para todo el servidor.
- En el `.env` pon la **IP sola** y el puerto que te dieron:

  ```dotenv
  PUBLIC_HOST=144.22.43.169
  PUERTO_PUBLICO=6702
  ```

- Ejecuta `bash deploy/deploy.sh` como siempre.
  - Cryptoville levanta sus contenedores con nombres `cryptoville-*` y publica **solo** ese puerto.
  - Antes de levantar nada, revisa que el puerto no lo use otro programa; si está ocupado, se detiene sin tocar nada.
- La app queda en `http://IP:PUERTO`, **sin HTTPS**: Let's Encrypt necesita los puertos 80 o 443 para dar el certificado.
- Para tener HTTPS en un servidor compartido, el dueño puede agregar en su proxy (nginx, Caddy, Traefik) una ruta de `IP-con-guiones.sslip.io` hacia `localhost:PUERTO`.

## Despliegue automático con GitHub Actions

| Evento | CI (`ci.yml`) | Deploy (`deploy.yml`) |
|---|---|---|
| Push a una rama que no es `main` | Corre | No |
| Pull request hacia `main` | Corre | No |
| Merge a `main` | Corre | **Sí, solo si el CI pasó** |

`deploy.yml` entra al VPS por SSH con una llave **exclusiva**. En `~/.ssh/authorized_keys`, esa llave está restringida para que solo pueda ejecutar `deploy/ci-deploy.sh`. Ese script deja el servidor igual a `main` y ejecuta `deploy/deploy.sh`.

### Configuración (una sola vez)

1. **En tu PC**, genera la llave y deja la frase en blanco (presiona Enter dos veces):

   ```bash
   ssh-keygen -t ed25519 -C "cryptoville-github-actions" -f ~/.ssh/cryptoville_actions
   ```

2. **En el VPS**, con el proyecto ya actualizado (`git pull`), respalda `authorized_keys` y **agrega al final** la llave pública, con la restricción delante:

   ```bash
   cp ~/.ssh/authorized_keys ~/.ssh/authorized_keys.respaldo
   echo 'command="bash ~/pinguinos/Cryptoville/deploy/ci-deploy.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty CONTENIDO_DE_cryptoville_actions.pub' >> ~/.ssh/authorized_keys
   ```

   Usa `>>`, que agrega una línea. Con un solo `>` se borrarían las llaves que ya están.

3. **En GitHub** (*Settings → Secrets and variables → Actions*):

   | Tipo | Nombre | Valor |
   |---|---|---|
   | Secret | `VPS_HOST` | `144.22.43.169` |
   | Secret | `VPS_USER` | `ubuntu` |
   | Secret | `VPS_SSH_KEY` | Contenido completo de `~/.ssh/cryptoville_actions` (la **privada**) |
   | Secret | `VPS_KNOWN_HOSTS` | Salida de `ssh-keyscan 144.22.43.169` |
   | Variable | `URL_PUBLICA` | `http://144.22.43.169:6702` |

4. **Protección de `main`** (*Settings → Branches → Add rule* para `main`):
   - *Require a pull request before merging*;
   - *Require status checks to pass*, con los 4 trabajos del CI.

> No pruebes la llave de Actions a mano antes del primer merge: el script deja el servidor igual a `main`, y si `main` todavía no tiene el código nuevo, el servidor quedaría con la versión vieja.

## Actualizar la app

```bash
git pull
bash deploy/deploy.sh
```

Si cambiaste solo variables del `.env`, también basta con `bash deploy/deploy.sh`.

## Tareas comunes

| Tarea | Comando (desde la raíz del proyecto) |
|---|---|
| Ver logs | `docker compose -f deploy/docker-compose.yml logs -f` (o `... logs -f api`) |
| Estado de los servicios | `docker compose -f deploy/docker-compose.yml ps` |
| Salud | `curl https://TU-HOST/api/health` |
| Reiniciar | `docker compose -f deploy/docker-compose.yml restart` |
| Detener | `docker compose -f deploy/docker-compose.yml down` |
| Respaldo inmediato | `docker compose -f deploy/docker-compose.yml run --rm backups --una-vez` |
| Ver respaldos | `ls -lh deploy/backups/` |

### Restaurar un respaldo

Hazlo en un proyecto de Supabase **nuevo**:

```bash
gunzip -c deploy/backups/cryptoville-AAAAMMDD-HHMM-auth.sql.gz   | psql "$DIRECT_URL"
gunzip -c deploy/backups/cryptoville-AAAAMMDD-HHMM-public.sql.gz | psql "$DIRECT_URL"
```

## Si algo falla

| Síntoma | Causa probable | Solución |
|---|---|---|
| El navegador no abre la página | Puertos cerrados | Revisa la **Security List** (paso 1) y vuelve a ejecutar `sudo bash deploy/setup-vps.sh` |
| «Certificado no válido» los primeros minutos | Caddy todavía está pidiendo el certificado | Espera 1–2 minutos y revisa `docker compose -f deploy/docker-compose.yml logs caddy` |
| `deploy.sh` falla en las migraciones | `DIRECT_URL` incorrecta | Usa el **Session pooler** (5432) con la contraseña correcta |
| `/api/health` muestra `base_de_datos: false` | `DATABASE_URL` incorrecta o el proyecto de Supabase pausado | Revisa la cadena o reactiva el proyecto en Supabase |
| Las wallets no conectan | Estás entrando por `http://` | Usa `PUBLIC_HOST` con sslip.io para tener HTTPS |
| La construcción se queda sin memoria | El VPS tiene poca RAM | `setup-vps.sh` crea swap; vuelve a ejecutarlo y reintenta |
