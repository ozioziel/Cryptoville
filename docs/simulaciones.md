# Partes simuladas o sin probar

Lo que hoy funciona **de mentira** (para poder probar el flujo completo en testnet) o que está programado pero **nadie probó todavía con el servicio real**. Todo esto hay que revisarlo antes de mainnet. La lista de lanzamiento está en [mainnet.md](mainnet.md).

| # | Parte | Estado | Dónde está |
|---|---|---|---|
| 1 | Pagar con el QR del banco (en un pedido o desde el saldo de arriba: «Recargar con el QR de tu banco») | 🟡 **Simulada** en testnet | `apps/api/src/rampas/`, `apps/web/src/ui/pagos/PagarConQr.tsx`, `apps/web/src/ui/pagos/Saldo.tsx`, `packages/shared/src/rampas.ts` |
| 2 | Pasar a mi banco (retiro) | 🟡 **Simulada** en testnet; con Pollar **no está hecha** | `apps/api/src/rampas/`, `apps/web/src/ui/panels/PanelRetiro.tsx` |
| 3 | Rampa real con Pollar (QR del banco) | 🟠 **Programada, sin probar** | `apps/web/src/features/rampas/pollar.ts` |
| 4 | Entrar con Google | 🔴 **Apagado** (`POLLAR_GOOGLE` vacío): programado con Pollar, pero en la prueba no funcionó | `apps/web/src/features/auth/pollar.ts`, `sesion.tsx`, `PanelBienvenida.tsx` |
| 5 | Entrar con el correo (Pollar) | 🟠 **Real, sin probar**: el panel de Pollar lo marca «próximamente» | los mismos archivos |
| 6 | KYC (Didit) | 🟡 **Sandbox**: verifica sin cobrar y sin validez real | `apps/api/src/kyc/` |
| 7 | Cuentas «prueba-…» verificadas | 🟡 **De mentira**, solo en la base local | `scripts/datos-de-prueba.mjs` |
| 8 | USDC de prueba | 🟡 **Token propio** de testnet, no es USDC | `contracts/usdc-prueba` |
| 9 | Correos (Resend) | 🟡 Remitente de prueba: solo llegan al dueño de la cuenta de Resend | `apps/api/src/notificaciones/` |
| 10 | Webhooks de Didit y Mux en tu PC | 🟡 No llegan (apuntan al servidor); la app consulta el estado sola | `kyc/`, `videos/` |
| 11 | Textos legales | 🟡 **Ejemplos** escritos por una IA | `apps/web/src/legal/` |

🟡 simulado a propósito · 🟠 programado, falta probarlo con el servicio real · 🔴 programado pero apagado

---

## 1. Pagar con el QR del banco (rampa simulada)

**Para qué:** quien no tiene USDC paga escaneando un QR con la app de su banco (QR Simple en Bolivia). Una rampa (proveedor de cambio con licencia) recibe los bolivianos y manda USDC a su wallet. Después la persona confirma el pago de siempre (garantía, etapas o directo). También se puede recargar sin un pedido: en el saldo de arriba → «Recargar con el QR de tu banco» (`PanelRecargar`), con la misma rampa simulada.

**Qué es de mentira** (solo con `RAMPA_SIMULADA=si`, que la API rechaza en mainnet):
- **El QR:** es un texto que empieza con `SIMULADO-CRYPTOVILLE|QR-SIMPLE|…`. Ningún banco lo puede cobrar.
- **El tipo de cambio:** fijo, **Bs 6,96 por dólar**, y una comisión de **1 %**. Están en `RAMPA_SIMULADA` de `packages/shared/src/rampas.ts`.
- **El pago del banco:** el botón «Simular el pago desde el banco (solo pruebas)» hace de banco. La API emite USDC de prueba a la wallet de la persona con la llave del **emisor del USDC de prueba**. Esa llave sale de `RAMPA_SIMULADA_LLAVE` o, en tu PC, de `.seed-keys.json`.
  - Es la **única** excepción a «el servidor nunca firma». Solo puede llamar a `mint` del token de pago, solo en testnet y solo con la rampa simulada encendida (`StellarService.emitirParaRampaSimulada`).

**Qué sí es real:** el USDC de prueba llega de verdad a la wallet, en testnet. Cada recarga queda en la tabla `rampas`, con su referencia y el hash de la transacción.

**Qué falta para que sea real:** ver la [parte 3](#3-rampa-real-con-pollar).

## 2. Pasar a mi banco (retiro simulado)

**Para qué:** el proveedor pasa su USDC a su cuenta del banco, en bolivianos.

**Qué es de mentira:**
- **El banco:** ninguno recibe dinero. La lista de bancos de Bolivia (`RAMPA_SIMULADA.bancos`) está escrita a mano.
- **El cambio:** el mismo tipo de cambio y la misma comisión fijos de la parte 1.

**Qué sí es real:** la persona firma con su wallet y manda el USDC de prueba de verdad (en testnet) a la dirección del emisor del USDC de prueba, que hace de rampa. La API lo verifica en la red. De la cuenta del banco solo se guardan los **últimos 4 dígitos**.

**Qué falta:**
- Con Pollar, el retiro **no está programado**. Hay que usar `createOffRamp` y `completeWithdraw` del SDK, con los datos bancarios que pida el proveedor (`requiredFields` de la cotización) y su propio KYC.
- Mientras tanto, en mainnet el panel «Pasar a mi banco» dice que todavía no está disponible.

## 3. Rampa real con Pollar

`apps/web/src/features/rampas/pollar.ts` ya usa el SDK de Pollar: `getRampCountries`, `getRampsQuote`, `createOnRamp` y `getRampTransaction`. Se usa **solo en mainnet** (`servicios.rampa === 'pollar'`) y solo si la persona entró con Google o con el correo. **Nadie lo probó todavía.** Antes de usarlo:

1. **Confirmar con Pollar** que tiene rampa para **Bolivia (BOB)**. Con una sesión iniciada, `getRampCountries()` lo responde; sin sesión, la API de Pollar devuelve 401.
2. **Confirmar que su forma de pago «QR» sirve con QR Simple** y qué bancos lo aceptan.
3. **Revisar el monto que se manda.** El código cotiza **en bolivianos** (`amount` en la moneda local, con el tipo de cambio simulado como aproximación). Hay que confirmar si Pollar espera el monto en la moneda local o en USDC.
4. **Firmas pendientes.** Si la respuesta trae `pendingSignature` (SEP-10 o `withdraw_payment`), el código **no la maneja todavía**: hay que firmarla con la wallet de Pollar y mandarla con `submitRampSignature`.
5. **KYC de la rampa:** si responde `kycRequired`, la persona sigue el `kycUrl`. Hay que ver si se puede reusar el KYC de Didit para no pedirlo dos veces.
6. **El token:** en testnet la rampa real entregaría USDC «de verdad» de testnet, **no** el USDC de prueba de Cryptoville (`PAYMENT_TOKEN_ID`). Por eso en testnet solo existe la rampa simulada. En mainnet, `PAYMENT_TOKEN_ID` tiene que ser el USDC que entrega la rampa.

Más contexto, preguntas abiertas y el plan B (Meru, otros *anchors*): `docs/propuestas/pagos-con-qr-bolivia.md`, que es un archivo local fuera de git.

> [!CAUTION]
> Este texto es solo un ejemplo de lo que recomienda una IA. Para que esté completo y tenga validez, debe revisarlo un abogado.
>
> (Qué licencia necesita el proveedor de cambio en Bolivia, qué le toca a Cryptoville si no custodia dinero y los controles contra el lavado de dinero.)

## 4 y 5. Entrar con Google y con el correo

**Es real, no simulado:** usa el login de Pollar (`login({ provider: 'google' })`, en una ventana de Google). La app «Cryptoville» de Pollar tiene encendidos Google y el correo; se comprobó con su `applications/config`.

**Google está apagado (8 oct 2026):** en la prueba con una cuenta de Google no funcionó. El botón solo aparece con `POLLAR_GOOGLE=si`; sin eso, el botón grande vuelve a ser «Entrar con tu correo». Antes de encenderlo, revisar con Pollar por qué falla (su panel marca el login como «próximamente»).

**Solo funciona con HTTPS o en `localhost`:** Pollar usa funciones del navegador que solo existen en páginas seguras. En el VPS con `http://IP:puerto` no funciona: ahí conviene dejar `POLLAR_API_KEY` vacío hasta tener HTTPS.

**Falta probarlo** con una cuenta de Google de verdad:
- En el panel de Pollar (**Build → Domains**) tienen que estar `http://localhost:5173` y la dirección de la página desplegada.
- Al entrar, Pollar crea una wallet para la persona y la app le pide **firmar el mensaje de inicio de sesión** (SEP-53) con esa wallet. Hay que confirmar que la wallet de Pollar lo firma bien.
- La cuenta nueva toma el **nombre de Google** en lugar de «Vecino 1234».
- El panel de Pollar marca su login como «próximamente». Si la ventana no abre o da error, es de su lado: anotar el mensaje y preguntarles.

## 6 a 11. Lo demás

- **KYC (Didit):** la app de Didit es la **sandbox**, que no cobra y no verifica de verdad. En mainnet se usa la app de producción (`ENTORNO_SERVICIOS=produccion`), que sí cobra por cada verificación.
- **Cuentas «prueba-…»:** `npm run datos:prueba` las marca como verificadas directamente en la base local, para no pasar por Didit en cada prueba (menos prueba-kyc).
- **USDC de prueba:** es un contrato propio. En mainnet, `PAYMENT_TOKEN_ID` es el contrato SAC del USDC real.
- **Correos:** con `onboarding@resend.dev` solo llegan al correo de la cuenta de Resend. Para enviar a cualquiera hace falta un dominio propio verificado.
- **Webhooks:** en tu PC no llegan; la app le pregunta a Didit y a Mux cómo va. En el servidor tienen que ir por HTTPS.
- **Textos legales:** son ejemplos. Lo que necesita un abogado está en rojo con el aviso de siempre.

## Cómo apagar lo simulado

- **Rampa simulada:** deja `RAMPA_SIMULADA` vacío. La opción del QR y «Pasar a mi banco» desaparecen.
- **En mainnet:** la API **no arranca** con `RAMPA_SIMULADA=si` (lo revisan `leerConfiguracion` y `npm run mainnet:revisar`).
