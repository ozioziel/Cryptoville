#!/usr/bin/env bash
# Despliegue que dispara GitHub Actions (workflow .github/workflows/deploy.yml).
#
# NO se ejecuta a mano: la llave de GitHub Actions está restringida en ~/.ssh/authorized_keys
# con command="bash ~/pinguinos/Cryptoville/deploy/ci-deploy.sh", así que esa llave SOLO
# puede correr este script (no abre una terminal ni hace otra cosa en el servidor).
#
# Qué hace:
#   1. Deja la copia del servidor igual a la rama main de GitHub
#      (no toca .env, .seed-keys.json ni deploy/backups: están ignorados por git).
#   2. Ejecuta deploy/deploy.sh (construye, migra, levanta y revisa la salud).
#   3. Borra solo las imágenes viejas de Cryptoville (nada de otros proyectos).
set -euo pipefail

CARPETA="$HOME/pinguinos/Cryptoville"
cd "$CARPETA"

# Un despliegue a la vez.
exec 9>"/tmp/cryptoville-deploy.lock"
if ! flock -n 9; then
  echo "Ya hay un despliegue de Cryptoville en curso; este se omite."
  exit 1
fi

echo "==> Actualizando el código desde GitHub (main)"
git fetch --prune origin main
git checkout -B main origin/main
echo "    Versión: $(git log -1 --format='%h %s')"

bash deploy/deploy.sh

echo "==> Limpiando imágenes viejas de Cryptoville"
docker image prune -f --filter "label=proyecto=cryptoville" >/dev/null || true
echo "Listo."
