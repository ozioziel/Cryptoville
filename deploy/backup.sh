#!/bin/sh
# Respaldo diario de la base de datos de Supabase con pg_dump.
# Corre dentro del contenedor "backups" (imagen postgres) y guarda en deploy/backups:
#   cryptoville-AAAAMMDD-HHMM-public.sql.gz  -> tablas de la app (schema public)
#   cryptoville-AAAAMMDD-HHMM-auth.sql.gz    -> cuentas de Supabase Auth (auth.users, solo datos)
# Borra los respaldos con más de BACKUP_KEEP_DAYS días (7 por defecto).
set -eu

DESTINO=/backups
DIAS="${BACKUP_KEEP_DAYS:-7}"
URL="${DIRECT_URL:?Falta DIRECT_URL en el .env}"

respaldar() {
  FECHA=$(date -u +%Y%m%d-%H%M)
  echo "[backup] $FECHA: iniciando"
  if pg_dump "$URL" --no-owner --no-privileges --schema=public | gzip > "$DESTINO/cryptoville-$FECHA-public.sql.gz.tmp" \
    && pg_dump "$URL" --no-owner --no-privileges --data-only --table=auth.users | gzip > "$DESTINO/cryptoville-$FECHA-auth.sql.gz.tmp"; then
    mv "$DESTINO/cryptoville-$FECHA-public.sql.gz.tmp" "$DESTINO/cryptoville-$FECHA-public.sql.gz"
    mv "$DESTINO/cryptoville-$FECHA-auth.sql.gz.tmp" "$DESTINO/cryptoville-$FECHA-auth.sql.gz"
    echo "[backup] $FECHA: listo"
  else
    rm -f "$DESTINO"/*.tmp
    echo "[backup] $FECHA: FALLÓ (revisa DIRECT_URL)" >&2
  fi
  find "$DESTINO" -name 'cryptoville-*.sql.gz' -mtime +"$DIAS" -delete
}

if [ "${1:-}" = "--una-vez" ]; then
  respaldar
  exit 0
fi

# Un respaldo al arrancar y luego uno cada 24 horas.
while true; do
  respaldar
  sleep 86400
done
