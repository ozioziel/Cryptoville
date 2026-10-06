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
| 5 | Web: villas | Phaser 3 + arte vectorial en SVG (`apps/web/src/arte`) | Navegador | 4 villas (una escena cada una) que crecen sin tope de lotes, edificio central con datos curiosos, interiores personalizables, personajes en vectores, teclado y joystick táctil |
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
│   │   ├── public/assets/        # gráficos de Kenney y mapa de Tiled del pueblo anterior (se conservan, ya no se usan)
│   │   └── src/
│   │       ├── arte/             # dibujos en SVG: personas, casas (exterior e interior) y villas
│   │       ├── game/             # EventBus, escenas (Arranque, Villa ×4, Interior), plano de lotes, texturas
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
├── packages/shared/              # tipos, estados, datos del contrato, enlaces al Lab, villas y categorías,
│                                 # catálogo de personas y casas, datos curiosos
├── supabase/config.toml          # Supabase local (desarrollo)
├── scripts/                      # setup local, compilar contratos, llaves de ejemplo, mapa
├── deploy/                       # docker-compose, Dockerfiles, Caddyfile, setup-vps.sh, deploy.sh
└── docs/                         # descripción, arquitectura, guías y roadmap
```

## Pruebas

| Parte | Cantidad | Qué cubren |
|---|---|---|
| Contratos (Rust) | 32 + 1 manual | Camino feliz, cada error, vencimientos, comisión, disputas, permisos, upgrade con el `.wasm` real, escrow + USDC de prueba |
| Shared (Vitest) | 32 | Transiciones, montos, argumentos del Lab, enlaces, reputación, villas y categorías, numeración de lotes, catálogo y validación de apariencias, conversión de los personajes viejos, datos curiosos, reglas de «Se busca» |
| API (Jest + Supabase local) | 23 | Inicio de sesión, transiciones válidas e inválidas, hashes repetidos, permisos del árbitro, RLS, lotes por villa, categorías, apariencias, «Se busca» y propuestas |
| Web (Vitest) | 23 | Firma local, buscador (con categoría), filtro de «Se busca», acciones por rol y plazo, plano de las villas, zoom, dibujo en vectores |

## Villas (desde el rediseño)

- **Datos:** el campo se sigue llamando `barrio` (enum `Barrio`: `creativo`, `tech`, `audiovisual`, `academy`). Los valores viejos se renombraron con `ALTER TYPE … RENAME VALUE` (`diseno → creativo`, `tecnologia → tech`, `clases → academy`), así que no se perdió nada. La API sigue aceptando los nombres viejos.
- **Lotes:** únicos por `(barrio, lote)` y sin tope (`lote >= 1`). La API asigna el primer número libre de la villa y reutiliza los huecos (`primerLoteLibre`). La posición de cada casa en el mapa sale solo de su número (`apps/web/src/game/plano.ts`), así que nunca cambia de lugar.
- **Categoría:** columna `categoria` de `locales`, validada contra las categorías de su villa en la API y con un CHECK en la base.
- **Apariencias:** columnas `apariencia` (jsonb) en `usuarios` y `locales`. La API las valida contra el catálogo de `packages/shared/src/apariencia.ts`. Si están vacías, se usa la persona equivalente al `avatar` (la columna se conserva) o la casa por defecto de la villa.
- **Dibujo:** las personas, las casas y las villas son SVG generados por funciones puras (`crearPersona`, `crearCasa`, `crearInterior`). React los muestra directo; Phaser los convierte en texturas con la resolución que pide el zoom y el `devicePixelRatio`, y solo dibuja lo que está cerca de la cámara.

## «Se busca»: el lado de la demanda

- **Tablas:** `busquedas` (lo que alguien necesita: villa, categoría, presupuesto, fecha límite, estado `abierta | asignada | cancelada`) y `propuestas` (una por proveedor y «Se busca»: monto, días, mensaje, estado `enviada | aceptada | rechazada | retirada`).
- **RLS:** los «Se busca» se leen en público; las propuestas solo las ven quien publicó, quien propuso y el árbitro. La web no escribe en ninguna de las dos.
- **API:** `POST /api/busquedas`, `POST /api/busquedas/:id/cerrar`, `POST /api/busquedas/:id/propuestas` (mandar o editar; hace falta tener local), `POST /api/propuestas/:id/retirar` y `POST /api/propuestas/:id/aceptar`.
- **Al aceptar una propuesta** se crea, en una transacción, un servicio inactivo en el local del proveedor (`servicios.busqueda_id`) y un pedido en estado `aceptado` con el monto y el plazo de la propuesta. Así el pedido sigue la misma máquina de estados y el mismo escrow que los demás, sin cambiar el contrato.
- **Avisos:** `nueva_propuesta`, `propuesta_aceptada` y `busqueda_cerrada`; la columna `avisos.busqueda_id` lleva al «Se busca». Realtime publica `busquedas` y `propuestas`.
- **Modo de la villa:** el interruptor «Quiero contratar» / «Quiero trabajar» (`modo` en `ui/estado.tsx`, evento `modo` del EventBus) rearma la escena de la villa con otras casas. En modo trabajar, cada «Se busca» abierto es una casa (evento `se-busca`), con la casa base de su villa, el cartel SE BUSCA y su autor en la puerta.
- **Lote de cada «Se busca»:** columna `busquedas.lote`. La API asigna el primer número libre entre los visibles de la villa (abiertos y sin vencer), con un candado por villa (`pg_advisory_xact_lock`).
- **Web:** la lupa de la barra abre la lista del modo actual (`ui/panels/PanelBuscar.tsx`, pestañas "Servicios" y "Se busca"; cambiar de pestaña cambia el modo). Los carteles están en `ui/components/Cartel.tsx`, y el detalle con las propuestas en `ui/panels/PanelBusqueda.tsx`.

