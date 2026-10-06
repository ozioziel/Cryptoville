# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Cryptoville: a 2D village (Phaser) where providers open shops and offer services. Clients pay through a Soroban escrow contract on Stellar **testnet**. Everything in the repo is written in **Spanish**: identifiers, comments, UI text, API error messages, docs, and commit messages (conventional-commit prefixes, Spanish body, e.g. `fix(setup): ...`). Keep it that way.

npm workspaces monorepo (Node >= 22):
- `packages/shared` — `@cryptoville/shared`, built with tsup to `dist/` (ESM + CJS)
- `apps/api` — NestJS 11 + Prisma 7, talks to Supabase
- `apps/web` — React 19 + Vite + Phaser 3
- `contracts/` — Rust/Soroban SDK 28 workspace (`escrow`, `usdc-prueba`); compiled `.wasm` files are committed in `contracts/dist/`

## Commands

```bash
npm install
npm run setup        # starts local Supabase (needs Docker), writes .env, migrates, generates .seed-keys.json, seeds
npm run dev          # builds shared, then shared watch + API :3000 + web :5173 (Vite proxies /api → :3000)
npm test             # shared (vitest) + API e2e (jest, needs local Supabase) + web (vitest)
npm run typecheck
npm run build
npm run db:reset     # wipe local DB, re-migrate, re-seed
npm run contract:build   # cargo test + build → contracts/dist/*.wasm (prints wasm hash for upgrade)
```

Single tests:
- Shared/web (Vitest): `npm run test -w @cryptoville/web -- -t "name"` or `npx vitest run src/logica.test.ts` inside the workspace
- API (Jest, e2e only, `test/*.e2e-spec.ts`): `npm run test -w @cryptoville/api -- -t "name"`. Needs `npm run setup` first. Tests create throwaway wallets and delete them afterwards.
- Contracts: `cd contracts && cargo test <name>`. The upgrade test with the real `.wasm` is `#[ignore]`; run it with `cargo test -- --ignored` after building.

**`@cryptoville/shared` is consumed from `dist/`.** Rebuild it (`npm run build -w @cryptoville/shared`) after changing it, or API/web typechecks will see stale types. `npm run dev` watches it for you.

API scripts run `prisma generate` first. Prisma reads the root `.env` via `apps/api/prisma.config.ts`. Migrations use `DIRECT_URL` and the running app uses `DATABASE_URL`.

## Architecture

**The app never connects to the Stellar network.** On-chain steps (`crear_pedido`, `marcar_entregado`, `liberar`, `reembolsar_por_vencimiento`, `cobrar_por_vencimiento`, `abrir_disputa`, `resolver`) are signed by users in Stellar Lab. The web app builds Lab links and shows the arguments to copy (`packages/shared/src/stellar/`). The user pastes the tx hash back into the app, and the counterparty verifies it in the Lab. The server never signs transactions or holds user keys.

**Data rule: the web reads from Supabase and writes through the API.**
- Web → Supabase (anon key + RLS) for all reads, including private ones (orders, steps, chat, disputes, notices), which RLS restricts to participants and the arbiter. Supabase Realtime powers chat and notices (`avisos`).
- Web → `/api` (NestJS) for every write. RLS forbids any direct write from the web. The API connects as the table owner through Prisma, so RLS doesn't apply to it.
- Photos: the API issues a one-time signed upload URL, then the web uploads to the Storage bucket `fotos`.

**Auth:** SEP-53 wallet signature over a one-time challenge (`POST /api/auth/desafio` → sign → verify offline in `apps/api/src/auth/firma-stellar.ts`). The API then signs into a real Supabase Auth account per wallet. The password is derived with HMAC from `AUTH_PASSWORD_SECRET` (`credenciales.ts`), so RLS and Realtime recognize the user. In dev, the web can sign locally with a secret key from `.seed-keys.json` (`features/auth/firma-local.ts`).

**Order state machine:** `packages/shared/src/order-states.ts` (`ACCIONES`) is the single source of truth for states, transitions, the allowed actor, and whether an action is on-chain. The API enforces it and the web uses it to decide which buttons to show. States after payment mirror the contract's states. Change transitions there, not in the API or web separately.

**Database:** `apps/api/prisma/schema.prisma` plus **hand-written SQL migrations**. `*_seguridad_rls/migration.sql` holds the FKs to `auth.users`, CHECK constraints, RLS policies, the `reputacion` view, the Realtime publication, and the Storage bucket. Any new table needs RLS policies and possibly Realtime added in SQL, not just in the Prisma schema.

**API layout quirk:** most Nest modules keep their controller and `@Module` in one file, and file names don't always match their contents. For example, `orders/orders.module.ts` holds `OrdersController`, `users/users.controller.ts` exports `UsersModule`, and `avisos/avisos.service.ts`, `prisma/prisma.service.ts`, and `supabase/supabase.service.ts` also export their modules. All routes are under the `/api` prefix. A global `ValidationPipe` (whitelist + forbidNonWhitelisted) and `ErroresFilter` return a Spanish `mensaje`, which the web's `lib/api.ts` surfaces. Throttling is 120/min globally and stricter on auth. `crearApp()` in `main.ts` is reused by the e2e tests.

**Web: Phaser ↔ React.** They communicate only through `apps/web/src/game/EventBus.ts`, with the event names typed in `EventosJuego`. Phaser never imports React components, and React never touches scenes. Scenes are `Arranque` (boot/preload), `Pueblo` (the town, 12 lots), and `Interior`. React panels live in `ui/panels/`. Global UI state lives in `ui/estado.tsx`: a panel stack (`PanelAbierto`), the loaded shops, a `version` counter bumped on Realtime changes, and notifications. The town map `public/assets/mapas/pueblo.json` (Tiled format) is generated by `npm run map:generate` (`scripts/generate-map.mjs`).

**Contract config** (`COMISION_BPS`, `PLAZO_REVISION_SEG`, contract and token IDs, `ARBITRO_DIRECCION`) is copied into `.env` from the Lab deployment and must match the contract constructor arguments. The env templates are `.env.example` (production) and `.env.local.example` (local).

## Deployment

Docker Compose on an ARM Ubuntu VPS (`deploy/`): Caddy serves the built web app, proxies `/api`, and terminates HTTPS through sslip.io. The API image is built from `deploy/api.Dockerfile`, and there is a daily `pg_dump` backup. CI (`.github/workflows/ci.yml`) runs the contract tests and build, the TS typecheck/test/build, the API e2e tests against local Supabase, and ARM Docker image builds. See `docs/` for the Stellar Lab, Supabase, and VPS guides.
