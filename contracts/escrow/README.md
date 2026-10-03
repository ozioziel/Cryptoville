# Contrato de escrow de Cryptoville

El cliente deposita el pago al crear el pedido y el contrato lo retiene. Después lo **libera** al proveedor (menos la comisión) o lo **reembolsa** al cliente. Si hay desacuerdo, el **admin del contrato** (el equipo de Cryptoville) actúa como árbitro.

Montos en unidades del token: el USDC de prueba tiene 7 decimales, así que `1 USDC = 10_000_000`. Las fechas van en segundos Unix.

## Constructor

| Argumento | Tipo | Ejemplo | Para qué |
|---|---|---|---|
| `admin` | Address | `G…` | Árbitro y administrador |
| `token` | Address | `C…` | Contrato del USDC de prueba (Stellar Asset Contract) |
| `comision_bps` | u32 | `300` | Comisión en puntos base (300 = 3%, tope 1000 = 10%) |
| `tesoreria` | Address | `G…` | Cuenta que recibe la comisión |
| `plazo_revision_seg` | u64 | `259200` | Tiempo que tiene el cliente para revisar la entrega (3 días) |

## Funciones

| Función | Quién firma | Desde qué estado | Resultado |
|---|---|---|---|
| `crear_pedido(cliente, proveedor, id, monto, fecha_limite_entrega)` | Cliente | — | **Pagado**: el monto queda en el contrato. `id` lo genera la app y no se puede repetir |
| `marcar_entregado(proveedor, id)` | Proveedor | Pagado (antes de la fecha límite) | **Entregado** |
| `liberar(cliente, id)` | Cliente | Pagado o Entregado | **Liberado**: el proveedor cobra el monto menos la comisión, y la comisión va a la tesorería |
| `rechazar(proveedor, id)` | Proveedor | Pagado o Entregado | **Reembolsado**: todo vuelve al cliente |
| `abrir_disputa(quien, id)` | Cliente o proveedor | Pagado o Entregado | **EnDisputa**: el dinero queda congelado |
| `resolver(admin, id, a_favor_de)` | Admin | EnDisputa | **Resuelto**: el dinero va a `Cliente` (reembolso) o a `Proveedor` (pago menos comisión) |
| `reembolsar_por_vencimiento(cliente, id)` | Cliente | Pagado y ya pasó la fecha límite | **Reembolsado** |
| `cobrar_por_vencimiento(proveedor, id)` | Proveedor | Entregado y ya pasó el plazo de revisión | **Liberado** |
| `set_comision(admin, bps)` | Admin | — | Cambia la comisión de los pedidos **nuevos** |
| `set_plazo_revision(admin, seg)` | Admin | — | Cambia el plazo de revisión de los pedidos **nuevos** |
| `set_tesoreria(admin, cuenta)` | Admin | — | Cambia la cuenta de la comisión |
| `upgrade(admin, wasm_hash)` | Admin | — | Reemplaza el código sin cambiar la dirección ni los datos |
| `pedido(id)` | — | — | Lee un pedido |
| `config()` | — | — | Lee la configuración |

Cada pedido guarda la comisión y el plazo de revisión que estaban vigentes **cuando se creó**. Así, si el admin los cambia después, nadie ve cambiar las reglas de un pedido que ya pagó.

Un contrato no se ejecuta solo cuando vence un plazo. Las funciones `*_por_vencimiento` las llama la persona interesada desde el Lab.

## Estados

```
            crear_pedido
 (nada) ───────────────► Pagado ──marcar_entregado──► Entregado
                           │  │                         │  │
                 rechazar /   \ liberar      liberar /    \ cobrar_por_vencimiento
       reembolsar_por_venc.    \                    /      \
                           ▼    ▼                  ▼        ▼
                     Reembolsado  Liberado ◄───────┘    Liberado
                           ▲
     Pagado / Entregado ──abrir_disputa──► EnDisputa ──resolver──► Resuelto
```

## Errores

| Código | Nombre | Significado |
|---|---|---|
| 1 | `PedidoYaExiste` | Ese `id` ya se usó |
| 2 | `PedidoNoExiste` | No hay pedido con ese `id` |
| 3 | `EstadoInvalido` | El pedido no está en el estado que permite la acción |
| 4 | `MontoInvalido` | El monto debe ser mayor que 0 |
| 5 | `FechaInvalida` | La fecha límite debe estar en el futuro |
| 6 | `NoAutorizado` | Esa wallet no puede hacer esa acción en ese pedido |
| 7 | `PlazoNoVencido` | Todavía no vence el plazo |
| 8 | `PlazoVencido` | Ya pasó la fecha límite de entrega |
| 9 | `ComisionInvalida` | La comisión pasa del tope (10%) |
| 10 | `MismaCuenta` | El cliente y el proveedor son la misma wallet |

## Eventos

| Evento | Cuándo | Datos |
|---|---|---|
| `evento_pedido` | En cada cambio de estado | Topic: `id`. Datos: `estado` y `monto` |
| `config_actualizada` | Cuando el admin cambia la configuración | Comisión, tesorería y plazo |

Los nombres de las funciones y sus argumentos también están en `packages/shared/src/stellar/contract.ts`: si cambias el contrato, actualiza ese archivo.
