# Arquitectura de Cryptoville (v1 y v2)

> Las secciones de arriba describen la **v1** y siguen valiendo. Lo nuevo de la **v2** (firmar en la app, contrato v2, confianza, pagos por fases, varios locales, sectores, portafolio y personas en línea) está en [v2: qué cambió](#v2-qué-cambió), al final.

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

En la **v1** la app **no se conecta a Stellar**: quien hace un paso lo firma en el Lab y pega el hash en la app; la otra parte lo revisa en el Lab y lo marca como verificado. En la **v2** la API sí lee la red (RPC): arma las transacciones para firmar en la app y verifica cada paso (ver abajo).

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

## v2: qué cambió

### Resumen

```
 Navegador
 ┌────────────────────────────────────────────────┐
 │ React + Phaser                                 │
 │ Wallets Kit · WalletConnect (QR) · Pollar       │──firma en el dispositivo
 │ Presence/Broadcast (personas en línea)          │
 └──┬──────────────┬───────────────────────┬──────┘
    │ escribe      │ lee + tiempo real     │ subidas directas
    ▼              ▼                       ▼
 ┌─ API NestJS ────────────────┐  ┌─ Supabase ───────────────┐  ┌─ Mux ──────────┐
 │ arma la tx sin firmar       │─►│ Postgres + RLS           │  │ videos         │
 │ la envía y la verifica      │  │ Realtime (canales        │  │ (Supabase solo │
 │ sincroniza eventos          │  │ privados por villa)      │  │ guarda el id)  │
 │ llave de mantenimiento      │  │ Storage: fotos, pruebas, │  └────────────────┘
 │ Didit (KYC) · Resend · Push │  │ capturas                 │
 └──────────────┬──────────────┘  └──────────────────────────┘
                │ RPC
                ▼
       Stellar: escrow v1, escrow v2, token
```

### Principios

| Principio | Cómo se cumple |
|---|---|
| **Listo pero apagado** | Cada servicio externo se enciende solo si están todas sus variables (`servicio()` en `apps/api/src/config/configuracion.ts`). Si falta alguna, la función se oculta y la app sigue como antes |
| **Una sola red** | `STELLAR_NETWORK` (`testnet` o `mainnet`) decide el passphrase, el RPC por defecto, las reglas (`reglasDe(red)`) y el mensaje de inicio de sesión (incluye la red: una firma de testnet no sirve en mainnet) |
| **El servidor no firma por nadie** | La API arma la transacción **sin firmar**, la wallet de la persona la firma y la API comprueba que el hash firmado sea el mismo que armó. La única llave del servidor es la de mantenimiento (abajo) |
| **El contrato manda** | Después de cada paso del v2 la API lee el pedido en el contrato (`pedido(id)`) y deja las fases de la base igual que en la red. Los plazos del v2 (revisión y disputa) también se leen del contrato (`ContratoV2Service`, cada hora) y van a la web en `/api/config` (`plazos_v2`); si no se pueden leer, se usan los del archivo de reglas |
| **Lo simulado se dice** | Lo que en testnet funciona de mentira (la rampa del QR del banco) o que falta probar con el servicio real está en [simulaciones.md](simulaciones.md). En mainnet la API no arranca con la rampa simulada |
| **Un archivo de reglas** | `packages/shared/src/reglas.ts`: comisiones, fases, plazos, tope por pedido, locales, sectores, chat, archivos, videos, portafolio y KYC. Lo que también vive en el contrato dice `// Debe coincidir con el contrato` |
| **Mainnet se revisa al arrancar** | `apps/api/src/config/revision-mainnet.ts`: en mainnet la API no arranca si queda algo de prueba (llaves de ejemplo, RPC de testnet, KYC apagado, HTTP…). También: `npm run mainnet:revisar` |

### Firmar dentro de la app y verificar

1. `POST /api/transacciones/preparar` arma y simula la transacción (`paso_pedido` del v1, `paso_v2`, `pago_directo`, `pago_local` o `retiro_rampa`) y la guarda en `transacciones_preparadas` (10 minutos).
2. La wallet la firma: Freighter y las de Stellar Wallets Kit, LOBSTR y otras por **WalletConnect (QR)**, o **Pollar** (entrar con correo).
3. `POST /api/transacciones/enviar` comprueba el hash, la envía, espera la confirmación y registra el paso **ya verificado**.
4. Respaldo: el Lab. Se pega el hash y la API lee esa transacción (`VerificadorService` en el v1, `verificarInvocacionV2` en el v2): contrato, función, partes, monto, fecha y número de pedido. Un hash falso o de otra transacción se rechaza. En los pedidos del v2, «¿Tu wallet no firma aquí? Hazlo en Stellar Lab» arma la transacción sin firmar para firmarla en el Lab (o en otra wallet); después se pega el hash (`POST /api/pedidos/:id/fases/pasos`) o la transacción firmada (`/transacciones/enviar`).
5. **Sincronización:** `apps/api/src/sincronizacion/` lee los eventos de los dos contratos cada 30 segundos (`sincronizacion_cadena` guarda el cursor), así un paso hecho fuera de la app también aparece.

**Llave de mantenimiento (`LLAVE_MANTENIMIENTO`):** una cuenta con poco XLM que solo puede llamar a funciones del v2 que cualquiera puede llamar y que siempre mandan el dinero a quien corresponde: `cobrar_por_vencimiento`, `reembolsar_por_vencimiento`, `resolver_por_vencimiento` y `extender` (cada 20 días). Lo limita `StellarService.firmarMantenimiento`.

### Cuentas y confianza

| Tema | Cómo funciona |
|---|---|
| **Varias wallets** | Una persona es una cuenta (`usuarios`) con varias wallets (`wallets`): una de la cuenta y una para cobrar. Para sumar una, la wallet nueva firma un mensaje que nombra la cuenta (`mensajeVincularWallet`) |
| **Entrar** | Con Pollar configurado: botón grande «Entrar con tu correo» (o «Entrar con Google», si `POLLAR_GOOGLE=si`; hoy apagado) y, más chico, «¿Ya usas Web3? Conecta tu wallet». Pollar crea la wallet por detrás y firma el mensaje de inicio de sesión; la cuenta nueva toma el nombre de Google. En testnet se conserva la entrada con una llave de prueba |
| **KYC (Didit)** | Una persona, una cuenta. Se guarda solo una **huella HMAC** de país, tipo y número de documento (`KYC_HMAC_SECRET`): nunca fotos ni el número. Una huella repetida no verifica otra cuenta. Se exige para abrir un local, cobrar y reseñar (`kyc.exigidoPara`). La insignia ✔ va junto al nombre: sobre la cabeza, en el perfil, en las propuestas y en los locales |
| **Reportar y bloquear** | `reportes` y `bloqueos`. El equipo revisa la cola en el panel del árbitro y puede descartar, ocultar el contenido o suspender la cuenta. Un bloqueo impide pedidos, propuestas y chat en los dos sentidos |
| **Avisos fuera de la app** | Web Push (VAPID, `public/sw.js`) y correo (Resend), con preferencias por persona. Recordatorios de plazos (`recordatorios`) |
| **Legales** | Seis documentos Markdown en `apps/web/src/legal/` con su versión; se aceptan la primera vez y cuando cambian (`aceptaciones_legales`). Todo lo que necesita un abogado va en rojo con el aviso de `AVISO_ABOGADO` |
| **Comentarios** | «Enviar comentarios» con captura opcional (bucket privado `capturas`); el equipo los ve en su panel |

### Pagos por fases (contrato v2)

| Método | Contrato | Comisión |
|---|---|---|
| Pagar directo | v2 `pagar_directo`: reparte en el momento, sin garantía ni disputa (solo reporte) | 1% |
| Pagar con garantía | v2 con 1 fase (o v1, si no hay contrato v2) | 3% |
| Por etapas | v2 con 2 a 5 fases | 3% de cada fase |

- **Plan de fases** (`fases`): qué incluye, % del proyecto, % del pago, fecha y pruebas pactadas. Lo arma el proveedor al aceptar (o en su propuesta a un «Se busca») y el cliente lo acepta o pide cambios **antes de pagar**. La lógica compartida está en `packages/shared/src/pagos.ts`.
- **Pruebas** (`pruebas`): archivos (bucket privado `pruebas`, con URL firmada), enlaces o videos de **Mux** con reproducción firmada. Al entregar, la huella del paquete (`textoHuellaEntrega`) va al contrato y las pruebas quedan selladas.
- **Expediente:** plan, pruebas, chat e historial de cada pedido, para las partes y el árbitro.
- **Disputas:** el panel del árbitro lista las del v1 (`disputas`) y las de las fases del v2 (en `fases`), con la fecha desde la que cualquiera puede repartir 50/50.
- **Pagar con el QR del banco y pasar a mi banco (rampas):** para quien no tiene USDC. Una rampa cambia bolivianos por USDC (y al revés). Cada operación queda en `rampas` (RLS: la persona y el árbitro). En testnet la rampa es **simulada** (`RAMPA_SIMULADA=si`): el QR es de mentira y la API emite USDC de prueba; en mainnet es la de Pollar. Detalle en [simulaciones.md](simulaciones.md).
- Detalle del contrato para el auditor: [contrato-v2.md](contrato-v2.md).

### Villa y comunidad

| Tema | Cómo funciona |
|---|---|
| **Varios locales** | Sin unicidad en `locales.usuario_id`. Hasta 3 gratis; del cuarto en adelante, un pago único en USDC a la tesorería (`pagos_plataforma`, una transacción por pago, verificada con el RPC); tope de 10. `PUT /api/mi-local` sigue con el local principal (el más antiguo). Nuevos: `GET /api/mis-locales`, `POST /api/locales`, `PUT /api/locales/:id` y `POST /api/locales/pago` |
| **Personalizar** | Perfil → Personalizar → «Mi personaje» o «Un local» (y cuál). Dentro de tu propia casa, «Editar» edita esa casa |
| **Sectores** | 60 casas por villa (la entrada más 8 calles). Después vienen «Creativo B», «Creativo C»… El sector sale del lote (`sectorDeLote`, `loteEnSector`), así las casas nunca se mueven. Solo se dibuja el sector donde estás; se pasa con el letrero del final de la última calle o con los botones A, B, C… junto al selector de villas. Cada modo cuenta aparte |
| **Propuestas** | Llevan el local desde el que se propone (`propuestas.local_id`), un plan de fases opcional (`plan`) y hasta 5 proyectos del portafolio (`proyectos`). Quien publicó elige la propuesta **y cómo paga**; por etapas, se usa el plan de la propuesta tal cual |
| **Portafolio** | `experiencias` y `proyectos` (fotos del bucket `fotos`, enlaces https con `rel="nofollow ugc noopener"`, videos de Mux o de YouTube y Vimeo según `portafolio.dominiosVideo`). Es público por RLS, salvo lo oculto y las cuentas suspendidas. Los proyectos **destacados** (hasta 4) cuelgan como cuadros en la pared del interior y se abren al tocarlos |
| **Personas en línea** | Canal privado de Supabase Realtime por villa y sector (`villa:tech:1`): Presence para saber quién está y Broadcast para las posiciones (hasta 8 por segundo, interpoladas). El nombre y la insignia se leen de `usuarios`, no del mensaje. Se dibujan las 50 más cercanas, con el nombre siempre visible. React maneja el canal (`features/cercania/PersonasEnLinea.tsx`) y Phaser solo recibe eventos (`game/objects/Personas.ts`) |
| **Chat por cercanía** | Cerca de alguien aparece «Hablar con… [H]» (en el celular, el mismo botón sin la tecla). Globo sobre la cabeza y una ventanita con «Visitar local», «Ver publicaciones», «Reportar» y «Bloquear». Los mensajes van por la API (`POST /api/cercania/mensajes`: 20 por minuto, respetando los bloqueos) y se guardan 7 días en `mensajes_cercania`, solo para revisar reportes. Después se borran solos, salvo que haya un reporte abierto |

### Módulos nuevos de la API

| Carpeta | Qué hace |
|---|---|
| `stellar/` | RPC: armar, simular, enviar y leer transacciones y eventos; llave de mantenimiento; verificador del v1 |
| `transacciones/` | Preparar y enviar las transacciones que se firman en la app |
| `sincronizacion/` | Eventos de los contratos, vencimientos, renovación (`extender`), cierre de pagos directos |
| `pagos/` | Métodos de pago, plan de fases, pruebas, contrato v2, expediente |
| `wallets/` | Varias wallets por cuenta |
| `kyc/` | Didit: sesión, webhook firmado, huella del documento |
| `moderacion/` | Reportes, bloqueos, suspensión |
| `notificaciones/` | Push, correo y recordatorios |
| `videos/` | Mux: subida directa, webhook y tokens de reproducción |
| `legal/` | Documentos, aceptaciones y comentarios |
| `locales/` | Varios locales y el pago del local extra |
| `portafolio/` | Experiencia y proyectos |
| `cercania/` | Chat por cercanía y su limpieza a los 7 días |
| `rampas/` | Pagar con el QR del banco y pasar a mi banco (rampa simulada en testnet) |
| `config/` | Configuración por red, servicios encendidos y revisión de mainnet |

### Variables nuevas

| Variable | Para qué |
|---|---|
| `STELLAR_RPC_URL`, `STELLAR_VERIFICAR` | RPC de la red y si se verifican los pasos (siempre `si` en mainnet) |
| `ESCROW_V2_CONTRACT_ID`, `TESORERIA_DIRECCION` | Contrato v2 y la cuenta que cobra comisiones y locales extra |
| `LLAVE_MANTENIMIENTO` | Vencimientos y `extender` (poco XLM) |
| `PUBLIC_URL`, `ENTORNO_SERVICIOS` | Dirección pública y si los servicios externos están en `pruebas` o en `produccion` |
| `POLLAR_API_KEY`, `WALLETCONNECT_PROJECT_ID` | Entrar con correo y wallets por QR |
| `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID`, `DIDIT_WEBHOOK_SECRET`, `KYC_HMAC_SECRET` | KYC |
| `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_WEBHOOK_SECRET`, `MUX_SIGNING_KEY_ID`, `MUX_SIGNING_KEY_PRIVATE` | Videos |
| `RESEND_API_KEY`, `CORREO_REMITENTE` | Correos de aviso |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTACTO` | Notificaciones del navegador |
| `RAMPA_SIMULADA`, `RAMPA_SIMULADA_LLAVE` | Solo testnet: la rampa simulada del QR del banco y la llave del emisor del USDC de prueba (si falta, la de `.seed-keys.json`) |

Plantillas: `.env.example`, `.env.local.example` y `.env.mainnet.example`. Qué falta para mainnet: [mainnet.md](mainnet.md).

### Pruebas (v2)

| Parte | Cantidad | Qué cubren |
|---|---|---|
| Contratos (Rust) | v1: 27 + 1 manual · v2: 27 + 1 manual · USDC de prueba: 5 | En el v2: garantía y etapas, cambios, vencimientos, disputas con sus tres resultados, pago directo, pausa, roles, actualización con 7 días de aviso (también con el `.wasm` real) y la propiedad «todo lo que entra sale a alguien» |
| Shared (Vitest) | 46 | Además de lo de v1: reglas por red, plan de fases y montos, estados derivados de las fases, huella de la entrega, legales, sectores, videos del portafolio y la cotización de la rampa simulada |
| API (Jest + Supabase local) | 86 en 10 suites | Además de lo de v1: lectura de transacciones sin red, wallets, legales, KYC y moderación, métodos de pago y plan por etapas, varios locales y el pago del local extra, propuestas con local, plan y proyectos, portafolio, chat por cercanía (RLS, límite, bloqueos, borrado a los 7 días), el canal privado de Realtime, la rampa simulada (recarga, pago simulado una sola vez, QR vencido, retiro, RLS), los errores de la base como 400 y la configuración (mismo contrato en v1 y v2, rampa solo en testnet). Las pruebas apagan los servicios externos del `.env` de quien las corre (`test/sin-servicios.ts`) |
| Web (Vitest) | 31 | Además de lo de v1: lógica de pagos y fases en la interfaz |

### Pendiente a propósito

- **Tribunal de la villa** (jurados de la comunidad para las disputas): la idea está guardada y **no se implementa por ahora**. Las disputas las resuelve el árbitro del equipo.
- **Monedas del juego:** no hay, para no confundir.

