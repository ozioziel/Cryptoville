# Guía de Stellar Lab: contratos, dinero de prueba y pagos

Todo lo que toca la red de Stellar se puede hacer en **[Stellar Lab](https://lab.stellar.org)**, en **testnet**. Con el contrato v1 la app solo arma los enlaces al Lab y guarda los hashes de las transacciones.

> **Desde v2** la app también **firma dentro de la app** (la wallet de cada persona firma; la API arma la transacción, la envía y la verifica con el RPC). El Lab sigue sirviendo para desplegar los contratos, configurarlos y como respaldo para cualquier paso. Ver [Contrato v2](#contrato-v2).

Tiempo estimado la primera vez: 30–40 minutos.

## Antes de empezar

| Necesitas | Cómo |
|---|---|
| Los contratos compilados | `npm run contract:build` → `contracts/dist/cryptoville_escrow.wasm` y `contracts/dist/cryptoville_usdc_prueba.wasm` |
| Las wallets de ejemplo | `npm run seed:keys` → `.seed-keys.json` (5 usuarios + el emisor del USDC). **Solo testnet** |
| Freighter (recomendado) | Extensión de navegador [freighter.app](https://www.freighter.app). En *Settings → Network* elige **Testnet** |

### Qué cuenta cumple cada papel

| Cuenta en `.seed-keys.json` | Papel |
|---|---|
| `emisor_usdc` | Despliega el **USDC de prueba** y lo emite (admin del token) |
| `usuarios[arbitro]` (Equipo Cryptoville) | Despliega el **escrow**, es su **admin** (árbitro) y su **tesorería** (recibe la comisión) |
| `ana`, `luis`, `sofia`, `diego` | Clientes y proveedores de la demo |

> **Consejo:** importa las 6 llaves secretas en Freighter (*Add account → Import a Stellar secret key*), con un nombre para cada una. Así, en el Lab solo cambias de cuenta en Freighter según quién tenga que firmar.

En la parte superior del Lab, revisa que diga **Testnet**.

---

## Paso 1. Fondear las cuentas con XLM de prueba (Friendbot)

Cada cuenta necesita un poco de XLM para pagar las comisiones de la red.

1. Abre **Account → Fund account** (<https://lab.stellar.org/account/fund>).
2. Pega la dirección pública (`G…`) y pulsa **Fund account**. El Lab muestra «Successfully funded».
3. Repite con las 6 cuentas: el emisor, el árbitro, Ana, Luis, Sofía y Diego.

> Si usas Freighter, también puedes pulsar **Fund with Friendbot** en cada cuenta.

---

## Paso 2. Desplegar el «USDC de prueba»

El dinero de la demo es un contrato de token (estándar SEP-41) que emite el emisor. El Lab no puede desplegar el contrato de un Stellar Asset clásico, pero sí este contrato, y el escrow lo usa igual que usaría el USDC real.

1. Abre **Smart contracts → Upload and deploy contract** (<https://lab.stellar.org/smart-contracts/deploy-contract>).
2. **Source account:** la dirección del **emisor**.
3. **Upload contract:** selecciona `contracts/dist/cryptoville_usdc_prueba.wasm`.
   1. Pulsa **Build upload transaction**.
   2. En *Add signature to upload*, firma: con **Wallet extension** (Freighter en la cuenta del emisor) o con **Sign with secret key** (la secreta del emisor).
   3. Pulsa **Upload contract** y espera la confirmación.
4. **Deploy contract:** aparecen los argumentos del constructor. Llénalos así:

   | Argumento | Valor |
   |---|---|
   | `admin` | dirección `G…` del **emisor** |
   | `decimales` | `7` |
   | `nombre` | `USDC de prueba` |
   | `simbolo` | `USDC` |

5. Pulsa **Build deploy transaction**, firma igual que antes y pulsa **Deploy contract**.
6. Copia la **dirección del contrato** (`C…`) que muestra el Lab. Es tu **`PAYMENT_TOKEN_ID`**.

### Repartir USDC de prueba (mint)

1. Abre **Smart contracts → Contract explorer**, pega el `PAYMENT_TOKEN_ID` y pulsa **Load contract**.
2. Ve a la pestaña **Invoke contract**.
3. Conecta Freighter (**Connect wallet**) con la cuenta del **emisor** seleccionada.
4. En la función **`mint`** llena:

   | Argumento | Valor |
   |---|---|
   | `to` | dirección `G…` de Ana |
   | `amount` | `10000000000` (son 1000 USDC: el token tiene 7 decimales) |

5. Pulsa **Simulate & submit** y aprueba en Freighter.
6. Repite con Luis, Sofía y Diego.

Para comprobar un saldo, usa la función `balance` con `id` = la dirección. Es solo lectura: basta con **Simulate**.

---

## Paso 3. Desplegar el contrato de escrow

1. **Smart contracts → Upload and deploy contract**.
2. **Source account:** la dirección del **árbitro** (Equipo Cryptoville).
3. **Upload contract:** `contracts/dist/cryptoville_escrow.wasm`. Luego **Build upload transaction**, firma con la cuenta del árbitro y pulsa **Upload contract**.
4. **Deploy contract:** llena el constructor:

   | Argumento | Valor |
   |---|---|
   | `admin` | `G…` del **árbitro** |
   | `token` | el `PAYMENT_TOKEN_ID` (`C…`) del paso 2 |
   | `comision_bps` | `300` (3%) |
   | `tesoreria` | `G…` del **árbitro** (o la cuenta que deba recibir la comisión) |
   | `plazo_revision_seg` | `259200` (3 días) |

5. Pulsa **Build deploy transaction**, firma y pulsa **Deploy contract**.
6. Copia la dirección `C…`: es tu **`ESCROW_CONTRACT_ID`**.

---

## Paso 4. Poner las direcciones en el `.env`

```dotenv
ESCROW_CONTRACT_ID=C…        # paso 3
PAYMENT_TOKEN_ID=C…          # paso 2
PAYMENT_ASSET=USDC de prueba
ARBITRO_DIRECCION=G…         # el admin del escrow
COMISION_BPS=300             # lo mismo que pusiste en el constructor
PLAZO_REVISION_SEG=259200
```

- **En tu PC:** detén y vuelve a ejecutar `npm run dev`.
- **En el VPS:** vuelve a ejecutar `bash deploy/deploy.sh`.

La API lee estas variables al arrancar. Después, el botón **«Abrir el contrato en Stellar Lab»** de la app ya apunta a tu contrato.

> El árbitro de la app es el usuario con rol `arbitro` en la base de datos (en los datos de ejemplo, «Equipo Cryptoville»). Para resolver disputas, su wallet debe ser la misma que el `admin` del escrow.

---

## Paso 5. Hacer un pedido de punta a punta

En la app, cada paso de un pedido muestra:
- el botón **«Abrir el contrato en Stellar Lab»**;
- la **función** que hay que llamar;
- los **valores exactos**, con su botón *Copiar*;
- un campo para **pegar el hash**.

En el Lab, el flujo es siempre el mismo:

1. Abre el enlace, que lleva al Contract Explorer con el escrow ya cargado, y ve a **Invoke contract**.
2. En Freighter, selecciona la cuenta de **quien hace el paso** y pulsa **Connect wallet**.
3. Busca la función y pega los valores.
4. Pulsa **Simulate & submit** y aprueba en Freighter.
5. Copia el **hash** de la transacción (64 caracteres) que muestra el Lab al terminar.
6. Pégalo en la app y pulsa **«Ya lo hice: registrar el paso»**.

La otra parte recibe un aviso y puede abrir la transacción en el Lab desde el historial del pedido. Si todo está bien, pulsa **«La revisé: verificar»**.

| Paso en la app | Función | Firma | Argumentos |
|---|---|---|---|
| Pagar en garantía | `crear_pedido` | Cliente | `cliente`, `proveedor`, `id`, `monto` (unidades, 7 decimales), `fecha_limite_entrega` (segundos Unix) |
| Marcar como entregado | `marcar_entregado` | Proveedor | `proveedor`, `id` |
| Liberar el pago | `liberar` | Cliente | `cliente`, `id` |
| Devolver el dinero | `rechazar` | Proveedor | `proveedor`, `id` |
| Abrir disputa | `abrir_disputa` | Cliente o proveedor | `quien`, `id` |
| Resolver disputa | `resolver` | Árbitro (admin) | `admin`, `id`, `a_favor_de` (`Cliente` o `Proveedor`) |
| Recuperar mi dinero (vencido) | `reembolsar_por_vencimiento` | Cliente | `cliente`, `id` |
| Cobrar (plazo vencido) | `cobrar_por_vencimiento` | Proveedor | `proveedor`, `id` |

**Ejemplo con los datos de ejemplo:** Ana tiene un pedido **aceptado** con Sofía («Clase de guitarra»).

1. Entra a la app con la wallet de Ana y abre *Mis pedidos → Clase de guitarra → Pagar en garantía*.
2. Haz `crear_pedido` en el Lab con la cuenta de Ana.
3. Entra con la wallet de Sofía y haz `marcar_entregado`.
4. Vuelve a Ana y haz `liberar`.

Sofía recibe 9.7 USDC y la tesorería 0.3 USDC.

> Los pedidos cerrados de los datos de ejemplo son solo de muestra: no existen en el contrato.

---

## Paso 6. Revisar transacciones y datos

| Qué | Dónde |
|---|---|
| Una transacción | Desde el historial del pedido en la app (enlace **«Ver transacción en Stellar Lab»**) o en **Transactions → Transaction dashboard** pegando el hash |
| Un pedido en el contrato | Contract Explorer del escrow → **Invoke contract** → función `pedido`, con `id` = número del pedido → **Simulate** (no hace falta firmar) |
| La configuración | Función `config` → **Simulate** |
| Saldos | Contract Explorer del USDC de prueba → `balance` |
| Todo lo guardado | Contract Explorer → **Contract info → Contract storage** |

---

## Actualizar el contrato (upgrade) sin cambiar su dirección

1. `npm run contract:build`: el script muestra el **hash** del nuevo `cryptoville_escrow.wasm`.
2. En **Upload and deploy contract**, con el árbitro como *Source account*, haz solo el **Upload** del nuevo `.wasm`. No hagas *Deploy*.
3. En el Contract Explorer del escrow, llama a `upgrade` con `admin` = árbitro y `wasm_hash` = el hash. Firma con el árbitro.
4. Si cambiaron funciones o argumentos, actualiza `packages/shared/src/stellar/contract.ts` y vuelve a desplegar la app.

Los pedidos guardados en el contrato se conservan.

---

## Errores frecuentes

| Mensaje | Qué pasa | Solución |
|---|---|---|
| `Error(Contract, #1)` PedidoYaExiste | Ese número de pedido ya se usó | Revisa que no lo hayas enviado dos veces; si la base se reinició, crea un pedido nuevo |
| `#3` EstadoInvalido | El pedido no está en el estado necesario | Revisa en qué paso va el pedido en la app |
| `#5` FechaInvalida | La fecha límite ya pasó | Cancela y vuelve a pedir el servicio |
| `#6` NoAutorizado | Firmaste con otra cuenta | Cambia de cuenta en Freighter |
| `#7` PlazoNoVencido | Todavía no vence la fecha o el plazo | Espera; la app muestra desde cuándo se puede |
| `#8` PlazoVencido | La entrega se marcó tarde | El cliente puede recuperar su dinero |
| Error de saldo del token | El cliente no tiene USDC de prueba suficiente | Haz `mint` desde el emisor (paso 2) |
| «Account not found» | La cuenta no está fondeada | Paso 1 (Friendbot) |
| «tx_bad_seq» o la simulación falla | La cuenta tenía otra transacción en curso | Espera unos segundos y repite |

La app muestra esta misma tabla de errores en cada paso, en *«¿El Lab mostró un error?»*.

---

## Contrato v2

El contrato v2 (`contracts/escrow-v2`) suma los pagos **por etapas** (1 a 5 fases), el **pago directo**, roles separados (`admin` y `arbitro`), pausa de emergencia y actualizaciones con **7 días de aviso**. Su documento para el auditor está en [contrato-v2.md](contrato-v2.md). El v1 sigue funcionando igual: los pedidos viejos se quedan en el v1.

### 1. Cuentas

| Cuenta | Papel | En testnet |
|---|---|---|
| `admin` | Configura el contrato y propone actualizaciones | Puede ser la del Equipo Cryptoville. En mainnet, **multifirma** |
| `arbitro` | Resuelve disputas | Otra cuenta (no la misma que el admin). En mainnet, multifirma |
| Tesorería | Recibe las comisiones y el pago de los locales extra | Otra cuenta, con trustline del token |
| Llave de mantenimiento | La usa la API para ejecutar vencimientos y `extender` | Una cuenta nueva con un poco de XLM (Friendbot). No necesita USDC |

### 2. Desplegar

1. `npm run contract:build` → `contracts/dist/cryptoville_escrow_v2.wasm`.
2. **Smart contracts → Upload and deploy contract**, con el admin como *Source account*: sube el `.wasm` y despliégalo con este constructor:

   | Argumento | Valor |
   |---|---|
   | `admin` | `G…` del admin |
   | `arbitro` | `G…` del árbitro |
   | `token` | el `PAYMENT_TOKEN_ID` (`C…`) |
   | `tesoreria` | `G…` de la tesorería |
   | `comision_bps` | `300` (garantía y etapas: 3%) |
   | `comision_directo_bps` | `100` (pago directo: 1%) |
   | `plazo_revision_seg` | `259200` (3 días) |
   | `plazo_disputa_seg` | `1209600` (14 días; después, cualquiera reparte 50/50) |
   | `tope_pedido` | `0` en testnet (sin tope); `5000000000` en mainnet (500 USDC) |

   Los valores salen de `packages/shared/src/reglas.ts` y `packages/shared/src/stellar/contrato-v2.ts` (`argumentosConstructorV2`).
3. Copia la dirección `C…`: es tu **`ESCROW_V2_CONTRACT_ID`**.

### 3. `.env`

```dotenv
ESCROW_V2_CONTRACT_ID=C…      # el contrato v2
TESORERIA_DIRECCION=G…        # la misma del constructor
ARBITRO_DIRECCION=G…          # el árbitro del v2 (y el del v1, si lo usas)
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_VERIFICAR=si          # cada paso se verifica leyendo la red
LLAVE_MANTENIMIENTO=S…        # solo en el servidor; vencimientos y extender
```

Sin `ESCROW_V2_CONTRACT_ID` la app solo ofrece el pago con garantía del v1. Sin `LLAVE_MANTENIMIENTO` los vencimientos los ejecuta la persona interesada desde la app.

### 4. Firmar desde la app o desde el Lab

- **En la app:** el botón «Firmar con mi wallet» arma la transacción, tu wallet la firma (Freighter, LOBSTR por QR, Pollar…) y la app la envía y la verifica.
- **En el Lab (respaldo):** el panel del pedido muestra la función y los argumentos para copiar. Después pegas el hash en la app: la API lee esa transacción en la red y la rechaza si no es la que corresponde.

| Paso | Función | Quién firma |
|---|---|---|
| Pagar con garantía o por etapas | `crear_pedido(cliente, proveedor, id, fases)` | Cliente |
| Pago directo | `pagar_directo(cliente, proveedor, id, monto)` | Cliente |
| Entregar una fase | `entregar_fase(proveedor, id, fase, huella)` | Proveedor (la huella la calcula la app con sus pruebas) |
| Liberar una fase | `liberar_fase(cliente, id, fase)` | Cliente |
| Pedir cambios | `pedir_cambios(cliente, id, fase)` | Cliente |
| Disputa | `abrir_disputa(quien, id, fase)` → `resolver(arbitro, id, fase, resultado)` | Una de las partes → el árbitro |
| Vencimientos | `cobrar_por_vencimiento`, `reembolsar_por_vencimiento`, `resolver_por_vencimiento` | Cualquiera (la llave de mantenimiento lo hace sola) |

### 5. Actualizar el v2

1. `npm run contract:build` muestra el hash del nuevo `cryptoville_escrow_v2.wasm`. Súbelo (solo *Upload*).
2. Llama a `proponer_actualizacion(admin, wasm_hash)`. Queda público en la red.
3. **7 días después**, llama a `ejecutar_actualizacion(admin)`. Antes de eso falla con `#18 AvisoNoCumplido`. Para arrepentirte: `cancelar_actualizacion(admin)`.

### 6. Pausa de emergencia

`pausar(admin)` frena los pedidos y pagos directos **nuevos**. Liberar, reembolsar, resolver y los vencimientos siguen funcionando. `reanudar(admin)` la quita.

### Errores nuevos del v2

| Mensaje | Qué pasa |
|---|---|
| `#11` Pausado | El contrato está en pausa: no se pueden crear pedidos nuevos |
| `#12` TopeSuperado | El monto pasa del tope por pedido |
| `#13` PlanInvalido | 0 fases o más de 5 |
| `#14` FaseNoExiste | Ese número de fase no está en el plan |
| `#15` FaseAnteriorPendiente | Primero hay que cerrar las fases anteriores |
| `#16` SinCambios | Ya se pidieron los 2 cambios de esa fase |
| `#17` SinActualizacion | No hay una actualización propuesta |
| `#18` AvisoNoCumplido | Todavía no pasaron los 7 días de aviso |

---

## Al pasar a mainnet

- No uses el «USDC de prueba»: el escrow se despliega con el **contrato SAC del USDC real** en el argumento `token`. Su dirección se consulta en la documentación de Circle o de Stellar.
- Cambia `STELLAR_NETWORK=mainnet`.
- Usa cuentas reales y una cuenta **multifirma** como admin.
- Antes, haz una **auditoría** del contrato.
- La lista completa, con quién hace cada paso, está en [mainnet.md](mainnet.md).
