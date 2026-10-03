# Guía de Stellar Lab: contratos, dinero de prueba y pagos

Todo lo que toca la red de Stellar se hace en **[Stellar Lab](https://lab.stellar.org)**, en **testnet**. La app de Cryptoville no se conecta a Stellar: solo arma los enlaces al Lab y guarda los hashes de las transacciones.

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

## Al pasar a mainnet

- No uses el «USDC de prueba»: el escrow se despliega con el **contrato SAC del USDC real** en el argumento `token`. Su dirección se consulta en la documentación de Circle o de Stellar.
- Cambia `STELLAR_NETWORK=mainnet`.
- Usa cuentas reales y una cuenta **multifirma** como admin.
- Antes, haz una **auditoría** del contrato.
