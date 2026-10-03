#!/usr/bin/env bash
# Despliega (o actualiza) Cryptoville en el VPS.
#   1. Revisa que el .env esté completo.
#   2. Construye las imágenes.
#   3. Aplica las migraciones de Prisma en Supabase.
#   4. Levanta Caddy, la API y los respaldos.
#   5. Espera a que /api/health responda e imprime la URL.
#
# Uso:
#   bash deploy/deploy.sh                 # despliegue normal
#   bash deploy/deploy.sh --con-ejemplo   # además carga los 5 usuarios de ejemplo (usa .seed-keys.json)
#   ENV_FILE=../.env.otro bash deploy/deploy.sh   # otro archivo de variables (ruta relativa a deploy/)
#
# Puertos:
#   - Sin PUERTO_PUBLICO en el .env: usa 80 y 443 (VPS propio, HTTPS automático con sslip.io o dominio).
#   - Con PUERTO_PUBLICO=6702: usa SOLO ese puerto (VPS compartido). No toca 80/443 ni el firewall.
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RAIZ/deploy"
export ENV_FILE="${ENV_FILE:-../.env}"
ARCHIVO_ENV="$(cd "$RAIZ/deploy" && realpath "$ENV_FILE" 2>/dev/null || echo "$ENV_FILE")"
CON_EJEMPLO=false
[ "${1:-}" = "--con-ejemplo" ] && CON_EJEMPLO=true

rojo() { printf '\033[31m%s\033[0m\n' "$*"; }
verde() { printf '\033[32m%s\033[0m\n' "$*"; }
paso() { printf '\n\033[36m==> %s\033[0m\n' "$*"; }

paso "1/5 Revisando $ARCHIVO_ENV"
if [ ! -f "$ARCHIVO_ENV" ]; then
  rojo "No existe el archivo de variables. Ejecuta:  cp .env.example .env  y llénalo."
  exit 1
fi
leer() { grep -E "^$1=" "$ARCHIVO_ENV" | tail -n1 | cut -d= -f2- | tr -d '\r' || true; }

FALTAN=()
for VAR in PUBLIC_HOST SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY DATABASE_URL DIRECT_URL AUTH_PASSWORD_SECRET; do
  VALOR="$(leer "$VAR")"
  if [ -z "$VALOR" ] || [[ "$VALOR" == *TU-PROYECTO* ]] || [[ "$VALOR" == *TU-CLAVE* ]]; then FALTAN+=("$VAR"); fi
done
if [ ${#FALTAN[@]} -gt 0 ]; then
  rojo "Faltan o tienen el valor de ejemplo: ${FALTAN[*]}"
  echo "Revisa docs/guia-supabase.md y .env.example."
  exit 1
fi
if [ "$(leer AUTH_PASSWORD_SECRET | wc -c)" -lt 33 ]; then
  rojo "AUTH_PASSWORD_SECRET debe tener al menos 32 caracteres (genera uno con: openssl rand -hex 32)"
  exit 1
fi
for VAR in ESCROW_CONTRACT_ID PAYMENT_TOKEN_ID PAYMENT_ASSET ARBITRO_DIRECCION; do
  [ -z "$(leer "$VAR")" ] && echo "  Aviso: $VAR está vacío (la app funciona, pero el pago en Stellar Lab no estará listo; ver docs/guia-stellar-lab.md)."
done

HOST="$(leer PUBLIC_HOST)"
PUERTO="$(leer PUERTO_PUBLICO)"
if [ -n "$PUERTO" ]; then
  # VPS compartido: un solo puerto, solo HTTP (sin 80/443 no se puede pedir certificado HTTPS).
  if ! [[ "$PUERTO" =~ ^[0-9]+$ ]]; then rojo "PUERTO_PUBLICO debe ser un número (por ejemplo 6702)"; exit 1; fi
  export PUERTO_PUBLICO="$PUERTO"
  export SITIO=":80"
  URL="http://$HOST:$PUERTO"
  COMPOSE=(docker compose -f docker-compose.yml -f puerto-unico.yml)
  echo "  Modo puerto único: $PUERTO (solo HTTP). No se usan los puertos 80/443."
  # Seguridad para servidores compartidos: el puerto no puede estar ocupado por otro programa.
  OCUPADO="$( (ss -ltnp 2>/dev/null || true) | grep -E "[:.]$PUERTO[[:space:]]" || true)"
  if [ -n "$OCUPADO" ] && ! docker ps --format '{{.Names}} {{.Ports}}' | grep -q "cryptoville-caddy.*:$PUERTO->"; then
    rojo "El puerto $PUERTO ya lo usa otro programa del servidor:"
    echo "$OCUPADO"
    rojo "No sigo para no romper nada. Pide otro puerto y cambia PUERTO_PUBLICO."
    exit 1
  fi
elif [[ "$HOST" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || [ "$HOST" = "localhost" ]; then
  export SITIO="http://$HOST"
  URL="http://$HOST"
  COMPOSE=(docker compose -f docker-compose.yml -f puertos-estandar.yml)
  echo "  Modo solo HTTP (IP sin nombre). Para HTTPS usa $(echo "$HOST" | tr . -).sslip.io en PUBLIC_HOST."
else
  export SITIO="$HOST"
  URL="https://$HOST"
  COMPOSE=(docker compose -f docker-compose.yml -f puertos-estandar.yml)
fi
verde "  .env completo. Sitio: $URL"

paso "2/5 Construyendo las imágenes (la primera vez tarda varios minutos)"
"${COMPOSE[@]}" build

paso "3/5 Migraciones de la base de datos (Supabase)"
"${COMPOSE[@]}" run --rm --no-deps api npx prisma migrate deploy

if $CON_EJEMPLO; then
  paso "Datos de ejemplo"
  if [ ! -f "$RAIZ/.seed-keys.json" ]; then
    rojo "No existe .seed-keys.json en la raíz (genéralo en tu PC con: npm run seed:keys y cópialo al VPS)."
    exit 1
  fi
  SEED_KEYS="$RAIZ/.seed-keys.json" "${COMPOSE[@]}" run --rm --no-deps api npx tsx prisma/seed.ts
fi

paso "4/5 Levantando los servicios"
"${COMPOSE[@]}" up -d --remove-orphans

paso "5/5 Esperando a que la API responda"
for i in $(seq 1 40); do
  if "${COMPOSE[@]}" exec -T api wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    verde "  API sana."
    break
  fi
  [ "$i" -eq 40 ] && { rojo "La API no respondió. Revisa:  docker compose -f deploy/docker-compose.yml logs api"; exit 1; }
  sleep 3
done

# Comprobación desde afuera (la primera vez Caddy tarda unos segundos en obtener el certificado).
for i in $(seq 1 20); do
  if curl -fsS --max-time 5 "$URL/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 3
done

echo
verde "✔ Cryptoville está en línea:  $URL"
echo "  Salud:     $URL/api/health"
echo "  Logs:      docker compose -f deploy/docker-compose.yml logs -f"
echo "  Respaldos: deploy/backups/"
