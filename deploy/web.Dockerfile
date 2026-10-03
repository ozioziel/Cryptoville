# Web de Cryptoville (React + Phaser) servida por Caddy, que además hace HTTPS y reenvía /api a la API.
# Se construye desde la raíz del monorepo:  docker build -f deploy/web.Dockerfile .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci -w @cryptoville/shared -w @cryptoville/web --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @cryptoville/shared && npm run build -w @cryptoville/web

FROM caddy:2-alpine
# Etiqueta para limpiar solo las imágenes de este proyecto (deploy/ci-deploy.sh).
LABEL proyecto="cryptoville"
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
