# API de Cryptoville (NestJS + Prisma). Imagen multi-arquitectura: funciona en ARM (Oracle Ampere) y x86.
# Se construye desde la raíz del monorepo:  docker build -f deploy/api.Dockerfile .
FROM node:22-alpine AS build
WORKDIR /app
# Solo los package.json primero, para aprovechar la caché de Docker.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci -w @cryptoville/shared -w @cryptoville/api --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @cryptoville/shared && npm run build -w @cryptoville/api

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# Se conservan las dependencias de desarrollo porque incluyen la CLI de Prisma
# (migraciones) y tsx (datos de ejemplo), que se ejecutan con `docker compose run`.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/api ./apps/api
WORKDIR /app/apps/api
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health > /dev/null || exit 1
CMD ["node", "dist/main.js"]
