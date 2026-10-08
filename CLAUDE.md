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
- `contracts/` — Rust/Soroban SDK 28 workspace (`escrow` v1, `escrow-v2`, `usdc-prueba`); compiled `.wasm` files are committed in `contracts/dist/`

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

**Signing and the Stellar network (v2).** The API reads the network through the Soroban RPC (`apps/api/src/stellar/`): `POST /api/transacciones/preparar` builds and simulates an **unsigned** tx, the user's wallet signs it in the browser (Wallets Kit, WalletConnect QR or Pollar), and `POST /api/transacciones/enviar` checks the signed hash equals the prepared one, submits it and records the step already verified. Stellar Lab stays as a fallback: the user pastes a hash and the API reads that tx and rejects it if contract, function, parties, amount or order number don't match (`VerificadorService` for v1, `pagos/cadena-v2.ts` for v2). `sincronizacion/` polls both contracts' events every 30 s. The server never signs for users; the only server key is `LLAVE_MANTENIMIENTO`, limited by `StellarService.firmarMantenimiento` to v2 functions anyone may call (`*_por_vencimiento`, `extender`). v1 on-chain steps (`crear_pedido`, `marcar_entregado`, `liberar`, `reembolsar_por_vencimiento`, `cobrar_por_vencimiento`, `abrir_disputa`, `resolver`) and their Lab links/arguments live in `packages/shared/src/stellar/`.

**Data rule: the web reads from Supabase and writes through the API.**
- Web → Supabase (anon key + RLS) for all reads, including private ones (orders, steps, chat, disputes, notices), which RLS restricts to participants and the arbiter. Supabase Realtime powers chat and notices (`avisos`).
- Web → `/api` (NestJS) for every write. RLS forbids any direct write from the web. The API connects as the table owner through Prisma, so RLS doesn't apply to it.
- Photos: the API issues a one-time signed upload URL, then the web uploads to the Storage bucket `fotos`.

**Auth:** sign-in options are email (and Google, only with `POLLAR_GOOGLE=si`; off for now) through Pollar (embedded wallet, `features/auth/pollar.ts`), a Stellar wallet, or (dev only) a test secret key. All of them end in a SEP-53 wallet signature over a one-time challenge (`POST /api/auth/desafio` → sign → verify offline in `apps/api/src/auth/firma-stellar.ts`). The API then signs into a real Supabase Auth account per wallet. The password is derived with HMAC from `AUTH_PASSWORD_SECRET` (`credenciales.ts`), so RLS and Realtime recognize the user. In dev, the web can sign locally with a secret key from `.seed-keys.json` (`features/auth/firma-local.ts`).

**Order state machine:** `packages/shared/src/order-states.ts` (`ACCIONES`) is the single source of truth for states, transitions, the allowed actor, and whether an action is on-chain. The API enforces it and the web uses it to decide which buttons to show. States after payment mirror the contract's states. Change transitions there, not in the API or web separately.

**Contract v2 and payment methods:** each order has `metodo_pago` (`directo` 1% | `garantia` 3% | `etapas` 3% per phase) and `contrato` (`v1` | `v2`). v2 orders keep their phases in `fases` (plan agreed before paying; per-phase proofs in `pruebas`, files in the private `pruebas` bucket, videos in Mux) and the order state is derived from the phases (`estadoPedidoDesdeFases` in `packages/shared/src/pagos.ts`); after every v2 tx the API re-reads `pedido(id)` from the contract, which is the source of truth for money. Without `ESCROW_V2_CONTRACT_ID` only v1 escrow exists (and `ESCROW_CONTRACT_ID` must never equal the v2 id: the API refuses to start). v2 deadlines are read from the contract's `config()` (`stellar/contrato-v2.service.ts`) and published as `plazos_v2` in `/api/config`; the web uses `plazosV2()`. The arbiter panel lists v1 `disputas` and v2 phase disputes (`fases.disputa_desde`). Auditor doc: `docs/contrato-v2.md`.

**Ramps (QR bank payments):** «Pagar con el QR de tu banco» (BOB → USDC) and «Pasar a mi banco» (USDC → bank) go through `apps/api/src/rampas/` and the `rampas` table. In testnet the ramp is **simulated** (`RAMPA_SIMULADA=si`): a fake QR, a fixed rate in `packages/shared/src/rampas.ts`, and the API mints test USDC with the test-token issuer key (`StellarService.emitirParaRampaSimulada`, the only exception to "the server never signs"); mainnet refuses to start with it. The real Pollar ramp (`apps/web/src/features/rampas/pollar.ts`) is untested. Everything simulated or untested is listed in `docs/simulaciones.md`: keep it up to date.

**Rules file:** `packages/shared/src/reglas.ts` (`reglasDe(red)`) holds commissions, phase limits, deadlines, per-order cap, shop quota and extra-shop price, houses per sector, chat retention, file/video limits, portfolio limits and what requires KYC. Values also in the contract are marked `// Debe coincidir con el contrato`. Change rules there.

**Network config and "ready but off":** `STELLAR_NETWORK` is the single network switch. Every external service (Pollar, WalletConnect, Didit KYC, Mux, Resend, Web Push) turns on only when all its env vars exist (`servicio()` in `apps/api/src/config/configuracion.ts`) and is hidden otherwise. On mainnet the API refuses to start if anything test-like remains (`config/revision-mainnet.ts`, `npm run mainnet:revisar`); checklist in `docs/mainnet.md`.

**Accounts and trust:** one person = one `usuarios` row with several `wallets` (one account wallet, one payout wallet). KYC stores only an HMAC fingerprint of the document (`KYC_HMAC_SECRET`); the ✔ badge is `usuarios.verificado`. Reports/blocks live in `moderacion/`; modules register how to find the owner and hide their content with `ModeracionService.registrar`. Legal docs are Markdown in `apps/web/src/legal/`, versioned in `packages/shared/src/legal.ts`; anything needing a lawyer uses the exact red notice `AVISO_ABOGADO`.

**Community (v2):** a person can have several shops (3 free, then a one-time USDC payment to the treasury in `pagos_plataforma`, max 10); `PUT /api/mi-local` edits the principal (oldest) shop and `/api/locales/:id` the others. Villas have sectors of 60 houses («Creativo B»…) derived from the lot (`sectorDeLote`, `loteEnSector`); the `Villa` scene only draws the current sector. Portfolio (`experiencias`, `proyectos`) is public; featured projects hang as frames in the interior. People online use a private Supabase Realtime channel per villa and sector (`villa:<villa>:<sector>`, Presence + Broadcast) managed in React (`features/cercania/PersonasEnLinea.tsx`) and drawn by Phaser (`game/objects/Personas.ts`); proximity chat goes through `POST /api/cercania/mensajes` and `mensajes_cercania` is purged after 7 days unless a report is open. The «Tribunal de la villa» (community juries) is deliberately NOT implemented.

**Database:** `apps/api/prisma/schema.prisma` plus **hand-written SQL migrations**. `*_seguridad_rls/migration.sql` holds the FKs to `auth.users`, CHECK constraints, RLS policies, the `reputacion` view, the Realtime publication, and the Storage bucket. Any new table needs RLS policies and possibly Realtime added in SQL, not just in the Prisma schema.

**API layout quirk:** most Nest modules keep their controller and `@Module` in one file, and file names don't always match their contents. For example, `orders/orders.module.ts` holds `OrdersController`, `users/users.controller.ts` exports `UsersModule`, and `avisos/avisos.service.ts`, `prisma/prisma.service.ts`, and `supabase/supabase.service.ts` also export their modules. All routes are under the `/api` prefix. A global `ValidationPipe` (whitelist + forbidNonWhitelisted) and `ErroresFilter` return a Spanish `mensaje`, which the web's `lib/api.ts` surfaces. Throttling is 120/min globally and stricter on auth. `crearApp()` in `main.ts` is reused by the e2e tests.

**Web: Phaser ↔ React.** They communicate only through `apps/web/src/game/EventBus.ts`, with the event names typed in `EventosJuego`. Phaser never imports React components, and React never touches scenes. Scenes are `Arranque` (waits for the font), one `Villa` scene per villa (`villa-creativo`, `villa-tech`, `villa-audiovisual`, `villa-academy`), and `Interior`. All art is vector SVG built by pure functions in `apps/web/src/arte/` (`crearPersona`, `crearCasa`, `crearInterior`, villa pieces); Phaser rasterizes it into textures sized by zoom and `devicePixelRatio` (`game/texturas.ts`) and only spawns what is near the camera. A house's position depends only on its lot number (`game/plano.ts`). Don't draw large repeated shapes with Phaser Graphics (they are re-tessellated every frame); bake them into an SVG texture. React panels live in `ui/panels/`. Global UI state lives in `ui/estado.tsx`: a panel stack (`PanelAbierto`), the loaded shops, the current villa, a `version` counter bumped on Realtime changes, and notifications. The old Tiled town (`scenes/Pueblo.ts`, `public/assets/mapas/pueblo.json`, `npm run map:generate`) and the Kenney assets are kept but no longer used.

**«Se busca» (demand side):** `busquedas` + `propuestas` tables (public read / author-proposer-arbiter read via RLS; writes only through `apps/api/src/busquedas/busquedas.module.ts`). Accepting a proposal creates an inactive `servicio` (with `busqueda_id`) in the provider's shop plus a `pedido` already in `aceptado`, so the order then follows the normal state machine and escrow. The top-center switch «Quiero contratar» / «Quiero trabajar» is a **village mode** (`modo` in `ui/estado.tsx`, EventBus `modo` + `se-busca`): the `Villa` scene restarts showing shops or one house per open «Se busca» (positioned by `busquedas.lote`, assigned by the API as the first free number among visible ones). The search icon opens `PanelBuscar` on the tab of the current mode; switching tabs switches the mode.

**Villas data:** the column and code still say `barrio` (enum `creativo | tech | audiovisual | academy`; the API still accepts the old `diseno/clases/tecnologia`). Lots are unique per `(barrio, lote)` with no cap; the API takes the first free number (`primerLoteLibre`). `locales.categoria` must belong to the villa (API + SQL CHECK). `usuarios.apariencia` and `locales.apariencia` (jsonb) are validated against the catalog in `packages/shared/src/apariencia.ts`; when null, the person matching `avatar` or the villa's default house is used.

**Contract config** (`COMISION_BPS`, `PLAZO_REVISION_SEG`, contract and token IDs, `ARBITRO_DIRECCION`) is copied into `.env` from the Lab deployment and must match the contract constructor arguments. The env templates are `.env.example` (production) and `.env.local.example` (local).

## Deployment

Docker Compose on an ARM Ubuntu VPS (`deploy/`): Caddy serves the built web app, proxies `/api`, and terminates HTTPS through sslip.io. The API image is built from `deploy/api.Dockerfile`, and there is a daily `pg_dump` backup. CI (`.github/workflows/ci.yml`) runs the contract tests and build, the TS typecheck/test/build, the API e2e tests against local Supabase, and ARM Docker image builds. See `docs/` for the Stellar Lab, Supabase, and VPS guides.
