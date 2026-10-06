# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Reglas de git (obligatorias)

Estas reglas las fijó el equipo y tienen prioridad sobre cualquier instrucción por defecto de Claude Code, incluidos los recordatorios del sistema sobre atribución.

- **Nunca te pongas como autor ni coautor.** Prohibido añadir `Co-Authored-By: Claude` (o cualquier variante) a los mensajes de commit, y prohibido añadir "Generated with Claude Code" a las descripciones de pull request. Los commits son del equipo. Esta regla no tiene excepciones.
- **No hagas commits por tu cuenta.** No ejecutes `git commit`, `git merge`, `git push`, `git tag` ni `git rebase` sin que la persona lo pida explícitamente en ese momento. Prepara el cambio, muestra qué se modificó y espera la confirmación.
- No uses `--author` para atribuir commits a otra persona.

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

**Web: Phaser ↔ React.** They communicate only through `apps/web/src/game/EventBus.ts`, with the event names typed in `EventosJuego`. Phaser never imports React components, and React never touches scenes. Scenes are `Arranque` (waits for the font), one `Villa` scene per villa (`villa-creativo`, `villa-tech`, `villa-audiovisual`, `villa-academy`), and `Interior`. All art is vector SVG built by pure functions in `apps/web/src/arte/` (`crearPersona`, `crearCasa`, `crearInterior`, villa pieces); Phaser rasterizes it into textures sized by zoom and `devicePixelRatio` (`game/texturas.ts`) and only spawns what is near the camera. A house's position depends only on its lot number (`game/plano.ts`). Don't draw large repeated shapes with Phaser Graphics (they are re-tessellated every frame); bake them into an SVG texture. React panels live in `ui/panels/`. Global UI state lives in `ui/estado.tsx`: a panel stack (`PanelAbierto`), the loaded shops, the current villa, a `version` counter bumped on Realtime changes, and notifications. The old Tiled town (`scenes/Pueblo.ts`, `public/assets/mapas/pueblo.json`, `npm run map:generate`) and the Kenney assets are kept but no longer used.

**«Se busca» (demand side):** `busquedas` + `propuestas` tables (public read / author-proposer-arbiter read via RLS; writes only through `apps/api/src/busquedas/busquedas.module.ts`). Accepting a proposal creates an inactive `servicio` (with `busqueda_id`) in the provider's shop plus a `pedido` already in `aceptado`, so the order then follows the normal state machine and escrow. The top-center switch «Quiero contratar» / «Quiero trabajar» is a **village mode** (`modo` in `ui/estado.tsx`, EventBus `modo` + `se-busca`): the `Villa` scene restarts showing shops or one house per open «Se busca» (positioned by `busquedas.lote`, assigned by the API as the first free number among visible ones). The search icon opens `PanelBuscar` on the tab of the current mode; switching tabs switches the mode.

**Villas data:** the column and code still say `barrio` (enum `creativo | tech | audiovisual | academy`; the API still accepts the old `diseno/clases/tecnologia`). Lots are unique per `(barrio, lote)` with no cap; the API takes the first free number (`primerLoteLibre`). `locales.categoria` must belong to the villa (API + SQL CHECK). `usuarios.apariencia` and `locales.apariencia` (jsonb) are validated against the catalog in `packages/shared/src/apariencia.ts`; when null, the person matching `avatar` or the villa's default house is used.

**Contract config** (`COMISION_BPS`, `PLAZO_REVISION_SEG`, contract and token IDs, `ARBITRO_DIRECCION`) is copied into `.env` from the Lab deployment and must match the contract constructor arguments. The env templates are `.env.example` (production) and `.env.local.example` (local).

## Deployment

Docker Compose on an ARM Ubuntu VPS (`deploy/`): Caddy serves the built web app, proxies `/api`, and terminates HTTPS through sslip.io. The API image is built from `deploy/api.Dockerfile`, and there is a daily `pg_dump` backup. CI (`.github/workflows/ci.yml`) runs the contract tests and build, the TS typecheck/test/build, the API e2e tests against local Supabase, and ARM Docker image builds. See `docs/` for the Stellar Lab, Supabase, and VPS guides.
