# Arquitectura de Cryptoville (v1)

## Resumen

```
 Navegador (computadora o celular)
 ┌──────────────────────────────────────────┐        ┌──────────────────────────┐
 │ React (paneles) + Phaser (pueblo 2D)     │──link─►│ Stellar Lab (testnet)    │
 │ Wallets Kit: firma de inicio de sesión   │        │ firmar y enviar pasos    │
 └──┬──────────────────────┬────────────────┘◄─hash──│ del contrato; revisar    │
    │ escribe (/api)       │ lee + tiempo real       └──────────┬───────────────┘
    ▼                      ▼                                    ▼
 ┌──── VPS (Docker) ─────────┐   ┌──── Supabase (nube) ────┐  ┌─ Stellar testnet ─┐
 │ Caddy: HTTPS, web, /api   │   │ Postgres + RLS          │  │ Escrow (Soroban)  │
 │ API NestJS + Prisma ──────┼──►│ Realtime (chat, avisos) │  │ USDC de prueba    │
 │ Respaldos (pg_dump) ──────┼──►│ Storage (fotos)         │  └───────────────────┘
 └───────────────────────────┘   └─────────────────────────┘
```

La app **no se conecta a Stellar**. Quien hace un paso lo firma en el Lab y pega el hash en la app; la otra parte lo revisa en el Lab y lo marca como verificado.

## Componentes

| # | Componente | Tecnología | Dónde corre | Responsabilidad |
|---|---|---|---|---|
| 1 | Contrato de escrow | Rust + Soroban SDK 28 (`contracts/escrow`) | Stellar testnet, desplegado desde Stellar Lab | Retener el pago, entrega, liberar, reembolsar, fechas límite, disputas (árbitro = admin), comisión del 3% configurable, upgrade |
| 2 | Token de pago | «USDC de prueba», token SEP-41 (`contracts/usdc-prueba`) emitido por el admin | Stellar testnet, desplegado desde Stellar Lab | Moneda de la demo. En mainnet se reemplaza por el USDC real |
| 3 | Stellar Lab | lab.stellar.org | Navegador | Desplegar, emitir, llamar funciones, firmar y revisar transacciones |
| 4 | Web: paneles | React 19 + Vite + `supabase-js` | Navegador (servida por Caddy) | Servicios, pedidos, pasos en el Lab, chat, perfiles, reseñas, disputas, panel del árbitro, buscador |
| 5 | Web: pueblo | Phaser 3 + mapa de Tiled + gráficos de Kenney | Navegador | 1 mapa, 3 barrios, 12 lotes, interiores, teclado y joystick táctil |
| 6 | Wallets | Stellar Wallets Kit | Navegador | Solo para iniciar sesión (firma SEP-53) |
| 7 | API | NestJS 11 + Prisma 7 | Docker en el VPS | Sesión, locales, servicios, pedidos (máquina de estados), pasos, disputas, reseñas, avisos, permisos de subida |
| 8 | Base de datos | Supabase Postgres + RLS | Supabase | Datos de la app y vista `reputacion` |
| 9 | Tiempo real | Supabase Realtime | Supabase | Chat y avisos («te toca liberar el pago») |
| 10 | Archivos | Supabase Storage (bucket `fotos`) | Supabase | Fotos de los servicios (2 MB, solo imágenes) |
| 11 | Proxy / HTTPS | Caddy + sslip.io | Docker en el VPS | Puertos 80/443, HTTPS automático, web y `/api` |
| 12 | Respaldos | `pg_dump` diario | Docker en el VPS | 7 días en `deploy/backups/` |

## Reparto NestJS / Supabase

| Tarea | Quién | Por qué |
|---|---|---|
| Leer lo público (locales, servicios, perfiles, reseñas, reputación) | Web → Supabase | Rápido y sin pasar por la API; RLS permite solo lectura |
| Leer lo privado (pedidos, pasos, chat, disputas, avisos) | Web → Supabase | RLS deja ver solo a los participantes y al árbitro |
| Escribir cualquier cosa | Web → API → Postgres | Validación, máquina de estados y permisos en un solo lugar |
| Esquema y migraciones | Prisma (SQL escrito a mano) | Un solo dueño de las tablas; incluye RLS, Realtime y Storage |
| Inicio de sesión | API + Supabase Auth | La API verifica la firma de la wallet y obtiene una sesión real de Supabase Auth, así RLS y Realtime reconocen al usuario |
| Fotos | API da una URL firmada; la web sube a Storage | La llave secreta nunca sale del servidor |

## Flujo de un pedido

| Paso | Quién | Acción | Dónde |
|---|---|---|---|
| 1 | Proveedor | Abre su local y publica servicios | App |
| 2 | Cliente | Recorre el pueblo o busca, y pide un servicio | App |
| 3 | Proveedor | Acepta: precio final y fecha límite | App |
| 4 | Cliente | `crear_pedido`: deposita en garantía | Lab → pega el hash en la app |
| 5 | Proveedor | Verifica el pago en el Lab, trabaja y hace `marcar_entregado` | Lab + app |
| 6 | Cliente | `liberar`: el proveedor cobra el 97% y la tesorería el 3% | Lab + app |
| 6b | Cliente | `reembolsar_por_vencimiento` si no hubo entrega a tiempo | Lab + app |
| 6c | Proveedor | `cobrar_por_vencimiento` si el cliente no respondió en 3 días | Lab + app |
| 6d | Cualquiera | `abrir_disputa` → el árbitro hace `resolver` | Lab + app |
| 7 | Ambos | Reseña verificada | App |

**Estados en la app:**
- **antes del pago:** `solicitado` → `aceptado` (o `cancelado`);
- **desde el pago, los mismos que el contrato:** `pagado`, `entregado`, `en_disputa`, `liberado`, `reembolsado`, `resuelto`.

Todos se definen en `packages/shared/src/order-states.ts`.

## Seguridad

| Tema | Solución |
|---|---|
| Sesión | Firma SEP-53 de un mensaje con código de un solo uso (5 min) → sesión de Supabase Auth. Cada wallet tiene una contraseña interna derivada con HMAC (`AUTH_PASSWORD_SECRET`) que nunca sale del servidor |
| Llaves | `service_role` solo en la API. La web usa la llave anon |
| RLS | La web no puede escribir en ninguna tabla. Pedidos, chat y disputas solo los ven sus participantes y el árbitro |
| Hashes | Formato validado; un hash no se acepta dos veces |
| Árbitro | Solo el rol `arbitro` resuelve, y nunca en pedidos donde participa. En el contrato, solo el `admin` |
| API | Validación de cada dato, límite de peticiones (120/min; 20/min en el inicio de sesión), cabeceras de seguridad, logs JSON sin secretos |
| Fotos | URL firmada de un solo uso; el bucket limita tamaño y tipo |
| Contrato | Errores tipados; cada pedido conserva la comisión y el plazo con que se creó; tope de comisión del 10% |

## Variables de entorno (`.env`)

| Variable | Para qué |
|---|---|
| `PUBLIC_HOST` | Dominio, `IP.sslip.io` o IP del VPS |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Proyecto de Supabase |
| `DATABASE_URL` / `DIRECT_URL` | Postgres por los poolers de transacción y de sesión |
| `AUTH_PASSWORD_SECRET`, `AUTH_EMAIL_DOMAIN` | Cuentas internas de Supabase Auth por wallet |
| `STELLAR_NETWORK` | `testnet` |
| `ESCROW_CONTRACT_ID`, `PAYMENT_TOKEN_ID`, `PAYMENT_ASSET`, `ARBITRO_DIRECCION` | Copiados del Lab |
| `COMISION_BPS`, `PLAZO_REVISION_SEG` | Iguales que en el constructor del contrato |
| `BACKUP_KEEP_DAYS` | Días de respaldos |

Todas están documentadas en `.env.example` (producción) y `.env.local.example` (local).

## Estructura del monorepo

```
cryptoville/
├── apps/
│   ├── web/                      # React + Phaser
│   │   ├── public/assets/        # gráficos de Kenney y mapa de Tiled (pueblo.json)
│   │   └── src/
│   │       ├── game/             # EventBus, escenas (Arranque, Pueblo, Interior), objetos
│   │       ├── ui/               # componentes, paneles y estado global
│   │       ├── features/         # auth, services, orders, escrow (pasos en el Lab)
│   │       └── lib/              # api, supabase, config
│   └── api/                      # NestJS
│       ├── prisma/               # schema.prisma, migraciones (incluye RLS) y seed
│       ├── src/                  # auth, users, services, orders, escrow, disputes,
│       │                         # reputation, avisos, uploads, health, common
│       └── test/                 # pruebas de punta a punta (Jest + Supabase local)
├── contracts/                    # Rust + Soroban
│   ├── escrow/                   # contrato de garantía + pruebas
│   ├── usdc-prueba/              # token de la demo + pruebas
│   └── dist/                     # .wasm listos para subir al Lab
├── packages/shared/              # tipos, estados, datos del contrato, enlaces al Lab
├── supabase/config.toml          # Supabase local (desarrollo)
├── scripts/                      # setup local, compilar contratos, llaves de ejemplo, mapa
├── deploy/                       # docker-compose, Dockerfiles, Caddyfile, setup-vps.sh, deploy.sh
└── docs/                         # descripción, arquitectura, guías y roadmap
```

## Pruebas

| Parte | Cantidad | Qué cubren |
|---|---|---|
| Contratos (Rust) | 32 + 1 manual | Camino feliz, cada error, vencimientos, comisión, disputas, permisos, upgrade con el `.wasm` real, escrow + USDC de prueba |
| Shared (Vitest) | 13 | Transiciones, montos, argumentos del Lab, enlaces, reputación |
| API (Jest + Supabase local) | 13 | Inicio de sesión, transiciones válidas e inválidas, hashes repetidos, permisos del árbitro, RLS |
| Web (Vitest) | 10 | Firma local, buscador, acciones por rol y plazo, zoom |
