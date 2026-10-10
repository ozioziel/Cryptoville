# Contrato de garantía v2 (`contracts/escrow-v2`)

Documento para quien audite el contrato. Describe qué hace, quién puede llamar cada función, qué garantiza y qué riesgos conocidos tiene. El código está en `contracts/escrow-v2/src/lib.rs` y las pruebas en `contracts/escrow-v2/src/test.rs`.

> [!CAUTION]
> Este contrato todavía **no fue auditado**. No lo uses con dinero real (mainnet) hasta que una auditoría externa lo revise y se corrijan sus hallazgos.

## Qué hace

| Uso | Cómo funciona |
|---|---|
| **Pago con garantía** | El cliente deposita el total en el contrato. Es un plan de **1 fase** |
| **Pago por etapas** | Igual, con un plan de **2 a 5 fases**, cada una con su monto y su fecha límite. Se entrega y se libera fase por fase |
| **Pago directo** | Sin garantía: en la misma llamada el contrato reparte el pago (proveedor y comisión). No admite disputa |

La app (Cryptoville) arma las transacciones; las firma la wallet de cada persona. El servidor no firma pagos. La única llave del servidor es la **llave de mantenimiento**, que solo llama a funciones que cualquiera puede llamar (vencimientos y `extender`) y nunca puede mover dinero hacia sí misma.

## Roles

| Rol | Quién es | Qué puede hacer | Qué NO puede hacer |
|---|---|---|---|
| `admin` | Cuenta multifirma del equipo | Cambiar comisiones (tope 10%), plazos, tope por pedido, tesorería, árbitro y admin; pausar; proponer, cancelar y ejecutar actualizaciones (con 7 días de aviso) | Mover el dinero de un pedido; resolver disputas; acortar el aviso de actualización |
| `arbitro` | Cuenta multifirma distinta del admin | Resolver una disputa: `Cliente`, `Proveedor` o `Mitad` | Quedarse con el dinero; tocar fases que no están en disputa |
| Cliente | Quien paga | Crear el pedido, liberar una fase, pedir cambios (2 por fase), abrir una disputa | Recuperar una fase ya liberada |
| Proveedor | Quien cobra | Entregar una fase con la huella de su prueba, rechazar el pedido (devuelve lo pendiente), abrir una disputa | Cobrar una fase sin que el cliente la libere o venza el plazo de revisión |
| Cualquiera | Incluida la llave de mantenimiento | `cobrar_por_vencimiento`, `reembolsar_por_vencimiento`, `resolver_por_vencimiento`, `extender` | Elegir a quién va el dinero: siempre va a quien corresponde |

## Funciones

| Función | Firma | Estados de la fase | Efecto |
|---|---|---|---|
| `__constructor(admin, arbitro, token, tesoreria, comision_bps, comision_directo_bps, plazo_revision_seg, plazo_disputa_seg, tope_pedido)` | — | — | Guarda la configuración. Falla si una comisión pasa del 10% o el tope es negativo |
| `crear_pedido(cliente, proveedor, id, fases)` | cliente | — → `EnCurso` | Valida el plan (1 a 5 fases, montos > 0, fechas futuras y en orden), el tope y que el `id` no exista (ni como pedido ni como pago directo). Transfiere el total al contrato. Guarda la comisión y los plazos vigentes |
| `pagar_directo(cliente, proveedor, id, monto)` | cliente | — | Transfiere `monto − comisión` al proveedor y la comisión a la tesorería. Guarda el pago con su `id` |
| `entregar_fase(proveedor, id, fase, huella)` | proveedor | `EnCurso` → `Entregada` | Antes de la fecha límite y con las fases anteriores ya cerradas. Guarda la huella (SHA-256 del paquete de pruebas) |
| `liberar_fase(cliente, id, fase)` | cliente | `EnCurso`/`Entregada` → `Liberada` | Paga la fase al proveedor menos la comisión del pedido |
| `pedir_cambios(cliente, id, fase)` | cliente | `Entregada` → `EnCurso` | Dentro del plazo de revisión y hasta 2 veces. Corre la fecha de esa fase y de las siguientes en curso |
| `rechazar(proveedor, id)` | proveedor | `EnCurso`/`Entregada` → `Reembolsada` | Devuelve al cliente todas las fases pendientes |
| `abrir_disputa(quien, id, fase)` | cliente o proveedor | `EnCurso`/`Entregada` → `EnDisputa` | Congela la fase |
| `resolver(arbitro, id, fase, resultado)` | árbitro | `EnDisputa` → `Resuelta` | `Cliente`: reembolso · `Proveedor`: pago menos comisión · `Mitad`: 50/50 (comisión solo sobre la mitad del proveedor). Corre las fechas siguientes lo que duró la disputa |
| `resolver_por_vencimiento(id, fase)` | nadie | `EnDisputa` → `Resuelta` | Pasado `plazo_disputa_seg` (14 días), reparte 50/50 |
| `cobrar_por_vencimiento(id, fase)` | nadie | `Entregada` → `Liberada` | Pasado el plazo de revisión desde la entrega, paga al proveedor |
| `reembolsar_por_vencimiento(id, fase)` | nadie | `EnCurso` → `Reembolsada` | Pasada la fecha límite sin entrega, devuelve esa fase y las siguientes en curso. No aplica si una fase anterior está en disputa |
| `extender(id)` | nadie | — | Renueva el TTL del pedido y de la instancia |
| `set_comision`, `set_comision_directo`, `set_plazo_revision`, `set_plazo_disputa`, `set_tope`, `set_tesoreria`, `set_arbitro` | admin | — | Cambian la configuración **para pedidos nuevos** (cada pedido conserva su comisión y sus plazos) |
| `set_admin(admin, nuevo)` | admin y nuevo | — | Cambia el admin; firman los dos |
| `pausar`, `reanudar` | admin | — | La pausa solo frena `crear_pedido` y `pagar_directo` |
| `proponer_actualizacion(admin, wasm_hash)` | admin | — | Publica el hash; se puede ejecutar a los 7 días (`AVISO_ACTUALIZACION_SEG`, fijo) |
| `cancelar_actualizacion`, `ejecutar_actualizacion` | admin | — | Ejecutar falla antes de los 7 días o si no hay propuesta |
| `pedido`, `pago_directo`, `config`, `actualizacion` | — | — | Lectura |

## Errores

| # | Error | Cuándo |
|---|---|---|
| 1 | `PedidoYaExiste` | El `id` ya se usó (pedido o pago directo) |
| 2 | `PedidoNoExiste` | No hay pedido con ese `id` |
| 3 | `EstadoInvalido` | La fase no está en un estado que permita la acción |
| 4 | `MontoInvalido` | Monto ≤ 0, suma que desborda o tope negativo |
| 5 | `FechaInvalida` | Fecha pasada o fuera de orden |
| 6 | `NoAutorizado` | Firma alguien que no es la parte correcta |
| 7 | `PlazoNoVencido` | Se intenta un vencimiento antes de tiempo |
| 8 | `PlazoVencido` | Se entrega o se piden cambios fuera de plazo |
| 9 | `ComisionInvalida` | Comisión mayor al 10% |
| 10 | `MismaCuenta` | Cliente y proveedor son la misma cuenta |
| 11 | `Pausado` | Contrato en pausa (solo pedidos y pagos nuevos) |
| 12 | `TopeSuperado` | El monto pasa del tope por pedido |
| 13 | `PlanInvalido` | 0 fases o más de 5 |
| 14 | `FaseNoExiste` | Número de fase fuera del plan |
| 15 | `FaseAnteriorPendiente` | Una fase anterior sigue en curso o en disputa |
| 16 | `SinCambios` | Ya se pidieron los 2 cambios de la fase |
| 17 | `SinActualizacion` | No hay actualización propuesta |
| 18 | `AvisoNoCumplido` | Todavía no pasaron los 7 días de aviso |

Los textos que ve la persona están en `packages/shared/src/stellar/contrato-v2.ts` (`ERRORES_CONTRATO_V2`).

## Eventos

| Evento | Tópico | Datos |
|---|---|---|
| `PedidoCreado` | `id` | cliente, proveedor, total, número de fases |
| `FaseCambio` | `id` | fase, estado nuevo, monto |
| `PagoDirecto` | `id` | cliente, proveedor, monto, comisión |
| `ConfigActualizada` | — | toda la configuración nueva |
| `ActualizacionPropuesta` | — | `wasm_hash`, `ejecutable_desde` |

La API los lee con el RPC (`apps/api/src/sincronizacion/mantenimiento-v2.service.ts`) y, después de cada transacción, vuelve a leer el pedido con `pedido(id)`: **el contrato es la fuente de verdad del dinero**.

## Almacenamiento y TTL

- **Instancia:** `Config` y la actualización propuesta. Se extiende en cada escritura.
- **Persistente:** `Pedido(id)` y `Directo(id)`. Se extiende en cada escritura (umbral 30 días, hasta 120 días).
- La llave de mantenimiento llama a `extender` cada 20 días en los pedidos abiertos. Si una entrada se archiva, se puede restaurar (state archival de Soroban) antes de volver a usarla.

## Invariantes que se prueban

| Invariante | Prueba |
|---|---|
| Todo el dinero que entra sale a alguien (cliente, proveedor o tesorería) y la suma cuadra | `propiedad_todo_lo_que_entra_sale_a_alguien` (prueba de propiedad con acciones al azar) |
| La pausa nunca bloquea liberar, reembolsar, resolver ni vencimientos | `la_pausa_solo_frena_lo_nuevo` |
| Cada pedido conserva la comisión y los plazos con que se creó | `la_comision_y_los_plazos_del_pedido_no_cambian_si_cambia_la_config` |
| Solo el árbitro resuelve, ni siquiera el admin | `solo_el_arbitro_resuelve_y_ni_el_admin_puede` |
| El código no cambia sin 7 días de aviso | `actualizar_el_codigo_exige_siete_dias_de_aviso`, `actualizacion_real_con_wasm_compilado` (manual: `cargo test -- --ignored`) |
| Cada función exige la firma de quien actúa | `cada_funcion_exige_a_la_parte_correcta`, `las_funciones_piden_la_firma_de_quien_actua` |
| Funciona con el token real de la demo | `funciona_con_el_token_usdc_de_prueba` |

Total: 27 pruebas, más la de actualización con el `.wasm` real (marcada `#[ignore]`, la corre el CI después de compilar).

## Riesgos conocidos y decisiones para revisar

1. **La tesorería se lee al pagar.** La comisión de cada pedido es fija, pero la cuenta que la recibe es la tesorería vigente en ese momento (`set_tesoreria`). Es a propósito (se puede cambiar una cuenta comprometida), pero el admin podría desviar las comisiones futuras. Mitigación: admin multifirma.
2. **El admin puede cambiar el árbitro.** Con eso podría resolver disputas abiertas a su favor si también controla al nuevo árbitro. Mitigación: admin y árbitro multifirma con firmantes distintos; el cambio emite `ConfigActualizada` y la app lo puede vigilar.
3. **Actualizaciones.** Tras 7 días de aviso, el código nuevo puede hacer cualquier cosa con el dinero retenido. La app debe mostrar la actualización propuesta (`actualizacion()`) para que la gente pueda retirar o terminar sus pedidos antes.
4. **`liberar_fase` antes de la entrega.** El cliente puede liberar una fase en curso (por ejemplo, un anticipo). Es intencional.
5. **Redondeo.** La comisión se redondea hacia abajo (`calcular_comision`); en `Mitad`, el resto impar va al cliente.
6. **Desborde.** `monto * comision_bps` usa i128; el tope por pedido (500 USDC en mainnet, en `reglas.ts`) deja mucho margen. Los totales se suman con `checked_add`.
7. **Ids predecibles.** El id es el número de pedido que genera la API (`nuevoNumero`: segundos × 1000 + un número al azar de 0 a 999). Un tercero podría adivinarlo y "ocuparlo" con un pedido mínimo antes que el cliente: el pago fallaría con `PedidoYaExiste` y habría que crear el pedido otra vez. No se pierde dinero, pero es una molestia posible. Para revisar en la auditoría: usar ids más largos al azar o atar el id al cliente (por ejemplo, guardar los pedidos por `(cliente, id)`).
8. **Llave de mantenimiento.** Solo puede llamar a vencimientos y `extender` (lo controla `StellarService.firmarMantenimiento`). Si se filtra, lo peor es que alguien adelante un vencimiento que ya correspondía, y gaste su XLM.
9. **Pago directo.** No hay garantía ni disputa; en la app solo se puede reportar.

## Cómo compilar y probar

```bash
cd contracts && cargo test
npm run contract:build
cd contracts && cargo test -- --ignored
```

`npm run contract:build` deja `contracts/dist/cryptoville_escrow_v2.wasm` e imprime su hash (para `proponer_actualizacion`). Cómo desplegarlo en Stellar Lab: [guía de Stellar Lab](guia-stellar-lab.md#contrato-v2).

## Cómo comprobar el código desplegado

El `.wasm` que usa la app lo compila GitHub Actions (`.github/workflows/release-contrato.yml`) al publicar un tag `contratos-*`. Cada Release trae el `.wasm` y una attestation firmada por GitHub que une su hash con el commit, y el `.wasm` lleva `source_repo=github:ozioziel/Cryptoville` en sus metadatos (estándar SEP-55). Para comprobarlo:

1. `stellar contract info build --id C… --network testnet` lee el hash del código desplegado, busca su attestation en GitHub y muestra el repo, el tag, el commit y la corrida que lo compiló.
2. O a mano: el código desplegado (`stellar contract fetch --id C… --network testnet -o desplegado.wasm`) debe tener el mismo SHA-256 que el `.wasm` del Release, y `gh attestation verify desplegado.wasm --repo ozioziel/Cryptoville --signer-repo stellar-expert/soroban-build-workflow` confirma que lo compiló GitHub desde ese commit.
3. StellarExpert muestra el repo en la página del contrato solo si su servicio de verificación procesó el aviso del workflow; ese servicio no es confiable hoy, así que su «unverified» no prueba nada por sí solo.

Cómo publicar y desplegar un `.wasm` verificado: [guía de Stellar Lab](guia-stellar-lab.md#7-contratos-verificados-sep-55).
