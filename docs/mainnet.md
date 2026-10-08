# Pasar a mainnet

Cryptoville v2 está **preparado** para mainnet, pero **todavía no se lanzó**. Esta lista dice qué falta, quién lo hace y en qué orden. Nada de esto se hace solo: cada paso lo confirma una persona del equipo.

> [!CAUTION]
> Este texto es solo un ejemplo de lo que recomienda una IA. Para que esté completo y tenga validez, debe revisarlo un abogado.

## Quién hace qué

| Rol | Responsable de |
|---|---|
| **Claude (ya hecho)** | Código listo para las dos redes, revisión al arrancar, `.env.mainnet.example`, documentos legales de ejemplo, contrato v2 con sus pruebas y este documento |
| **Equipo de Cryptoville** | Cuentas y llaves de los servicios, despliegue de los contratos, cuentas multifirma, Supabase nuevo, VPS, prueba completa en testnet |
| **Abogado** | Términos, privacidad, pagos y disputas, contenido, impuestos, custodia de fondos, KYC y datos personales en los países donde se opera |
| **Auditor** | Auditoría externa de `contracts/escrow-v2` ([documento para el auditor](contrato-v2.md)) |

## 1. Antes de empezar

- [ ] **Auditoría del contrato v2** terminada y sus hallazgos corregidos. Después, volver a compilar (`npm run contract:build`) y desplegar el `.wasm` auditado.
- [ ] **Revisión legal** de los seis documentos de `apps/web/src/legal/` (todo lo marcado en rojo) y del flujo de KYC. Cambiar la versión de cada documento que se modifique (`packages/shared/src/legal.ts`): la app pide aceptarlos otra vez.

> [!CAUTION]
> Este texto es solo un ejemplo de lo que recomienda una IA. Para que esté completo y tenga validez, debe revisarlo un abogado.
>
> Puntos que el abogado debe mirar en especial: si guardar dinero en un contrato inteligente entre dos personas es custodia de fondos en tu país; quién responde si el árbitro se equivoca; qué datos del KYC se pueden guardar y por cuánto tiempo (la app guarda solo una huella HMAC del documento, nunca la foto ni el número); la retención de 7 días del chat por cercanía; y las obligaciones de impuestos de la plataforma y de los proveedores.

- [ ] **Reglas de mainnet** revisadas en `packages/shared/src/reglas.ts` (`REGLAS.mainnet`): comisiones (1%, 3% y 3%), tope por pedido (propuesto: 500 USDC), precio del local extra, plazos. Los valores que dicen `// Debe coincidir con el contrato` tienen que ser iguales a los del constructor.

## 2. Cuentas de Stellar (mainnet)

| Cuenta | Para qué | Cómo |
|---|---|---|
| `admin` | Configura el contrato y propone actualizaciones (7 días de aviso) | **Multifirma**: al menos 2 de 3 personas del equipo |
| `arbitro` | Resuelve disputas | **Multifirma**, con firmantes distintos del admin |
| Tesorería | Recibe las comisiones y el pago de los locales extra | Cuenta propia del equipo, con trustline de USDC |
| Llave de mantenimiento | Ejecuta vencimientos y renueva los pedidos (`extender`) | Cuenta nueva **con poco XLM** (por ejemplo, 20 XLM). No tiene USDC ni permisos |

- [ ] Crear las cuatro cuentas y configurar la multifirma (umbrales y firmantes) desde Stellar Lab.
- [ ] Guardar las llaves de los firmantes fuera de la computadora (wallets de hardware si se puede).
- [ ] La llave de mantenimiento va solo en el `.env` del VPS (`LLAVE_MANTENIMIENTO`).

## 3. Contratos

- [ ] Subir `contracts/dist/cryptoville_escrow_v2.wasm` a mainnet y desplegarlo con los argumentos del constructor ([guía](guia-stellar-lab.md#contrato-v2)):
  - `token`: el **contrato SAC del USDC real** (no el «USDC de prueba»);
  - `admin` y `arbitro` multifirma; `tesoreria`;
  - comisiones 300 y 100, plazo de revisión 259200, plazo de disputa 1209600, tope 5000000000 (500 USDC con 7 decimales).
- [ ] Anotar el id del contrato en `ESCROW_V2_CONTRACT_ID`.
- [ ] Decidir si se despliega también el escrow v1 (`ESCROW_CONTRACT_ID`). Si no, en mainnet solo existe el v2.

## 4. Servicios externos (cuentas de producción)

| Servicio | Variables | Notas |
|---|---|---|
| Supabase (proyecto **nuevo**, no el de testnet) | `SUPABASE_*`, `DATABASE_URL`, `DIRECT_URL` | Aplicar las migraciones. Activar Realtime Authorization (canales privados de «personas en línea») |
| RPC de Stellar mainnet | `STELLAR_RPC_URL` | Un proveedor de RPC de mainnet (el de la SDF es solo para testnet) |
| Didit (KYC) | `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID`, `DIDIT_WEBHOOK_SECRET`, `KYC_HMAC_SECRET` | Obligatorio en mainnet. `KYC_HMAC_SECRET` nuevo y largo: si cambia, las huellas viejas dejan de coincidir |
| Mux (videos) | `MUX_*` | Llaves de producción y una llave de firma para los videos privados |
| Pollar (entrar con Google o correo, rampa del QR del banco) | `POLLAR_API_KEY` | Llave de producción |
| WalletConnect (QR) | `WALLETCONNECT_PROJECT_ID` | |
| Resend (correos) | `RESEND_API_KEY`, `CORREO_REMITENTE` | Dominio propio verificado |
| Web Push | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTACTO` | Llaves nuevas: `npx web-push generate-vapid-keys` |

- [ ] `ENTORNO_SERVICIOS=produccion` (Didit, Mux y Pollar sin sandbox).
- [ ] `RAMPA_SIMULADA` vacío (la API no arranca si dice `si`). Revisar todo lo de [simulaciones.md](simulaciones.md): la rampa real de Pollar para Bolivia, el retiro al banco y el login con Google, probados con cuentas reales.
- [ ] Pollar (**Build → Domains**): el dominio de producción, para que funcione «Entrar con Google».

## 5. Servidor

- [ ] Copiar `.env.mainnet.example` a `.env` en el VPS y llenarlo. `STELLAR_NETWORK=mainnet`, `NODE_ENV=production`, `STELLAR_VERIFICAR=si`.
- [ ] Dominio propio con HTTPS (`PUBLIC_HOST`). La revisión no acepta `localhost` ni HTTP.
- [ ] Sin `.seed-keys.json` en el servidor (son llaves de testnet).
- [ ] Probar la configuración antes de arrancar:

  ```bash
  npm run mainnet:revisar
  ```

  Si falta algo, dice exactamente qué. **La API se niega a arrancar en mainnet** mientras quede un problema (por ejemplo: falta el KYC, el RPC apunta a testnet, `PAYMENT_ASSET` dice «de prueba», el árbitro y la tesorería son la misma cuenta, o `COMISION_BPS` no coincide con las reglas).
- [ ] Secretos nuevos en GitHub (Environment `mainnet` del workflow de despliegue) y en el VPS. Nunca reutilizar los de testnet.
- [ ] Respaldos diarios (`BACKUP_KEEP_DAYS`) y una prueba de restauración.

## 6. Ensayo completo en testnet

Antes de mainnet, con la misma configuración (pero de testnet) y personas reales del equipo:

- [ ] Entrar con correo (Pollar) y con wallet; sumar una segunda wallet a la cuenta.
- [ ] Verificar la identidad (Didit sandbox) y ver la insignia ✔ en la villa, el perfil y las propuestas.
- [ ] Un pedido **con garantía** de punta a punta, firmado dentro de la app.
- [ ] Un pedido **por etapas**: plan, pago, pruebas (archivo, enlace y video), pedir cambios, liberar cada fase, un vencimiento ejecutado por la llave de mantenimiento, una disputa resuelta por el árbitro y la reseña.
- [ ] Un **pago directo** y su reporte.
- [ ] Un hash falso o de otra transacción: la app lo rechaza.
- [ ] Abrir el cuarto local pagando la tarifa; propuesta a un «Se busca» desde un segundo local con plan y proyectos.
- [ ] Dos personas se ven caminando, se escriben por el chat por cercanía, una reporta y el equipo revisa la conversación.
- [ ] Avisos por correo y del navegador.
- [ ] Pausar el contrato y comprobar que liberar y reembolsar siguen funcionando.
- [ ] Proponer una actualización y comprobar que no se puede ejecutar antes de 7 días.

## 7. El día del lanzamiento

- [ ] Desplegar con el Environment `mainnet` del workflow (requiere aprobación manual).
- [ ] Abrir la app, revisar que no aparece la franja «Modo de prueba» y que los documentos legales piden aceptación.
- [ ] Hacer un pedido chico real del equipo, de punta a punta.
- [ ] Vigilar los registros de la API (sincronización de eventos y mantenimiento) las primeras horas.
