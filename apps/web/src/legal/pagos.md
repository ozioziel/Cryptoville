---
version: 2026-10-07
---
# Pagos, fases y disputas

## 1. Antes de pagar

1. El proveedor acepta el pedido y propone el plan: una fase (pago con garantía) o varias (por etapas, hasta {{fases_max}}).
2. Cada fase dice qué incluye, qué porcentaje del proyecto y del pago es, su fecha límite y qué prueba hay que subir.
3. Tú aceptas el plan o pides cambios. Recién ahí se paga.

## 2. Pagar directo

- El dinero va al proveedor en el momento. **No hay garantía**: si no entrega, nadie puede devolverte el dinero.
- No admite disputa; sí puedes reportar a la persona.
- Comisión: {{comision_directo}}.

## 3. Pagar con garantía o por etapas

- Pagas todo de una vez y el contrato lo guarda.
- En cada fase el proveedor sube su prueba y una huella de esa prueba queda en el contrato.
- Tienes {{plazo_revision_dias}} días para liberar el pago de esa fase o pedir cambios (hasta {{cambios_por_fase}} veces por fase).
- Si no respondes en ese plazo, el proveedor cobra esa fase.
- Si una fase vence sin entrega, recuperas el dinero de esa fase y de las que faltan.
- Los vencimientos los puede ejecutar cualquiera (también la app sola): el contrato siempre manda el dinero a quien corresponde.
- Comisión: {{comision_garantia}} (por etapas: {{comision_etapas}} de cada fase). Se descuenta de lo que cobra el proveedor.
- Tope por pedido: {{tope_pedido}}.

## 4. Disputas

- Cualquiera de las partes puede abrir una disputa por una fase. El dinero de esa fase queda congelado y las fases siguientes esperan.
- El árbitro (el equipo de Cryptoville) revisa el expediente: el plan, las pruebas, el chat y las transacciones.
- El árbitro decide a favor del cliente, del proveedor o reparte 50/50. Nunca puede quedarse con el dinero.
- Si el árbitro no decide en {{plazo_disputa_dias}} días, cualquiera puede repartir esa fase 50/50.

> [!ABOGADO] Definir el procedimiento de la disputa (plazos para presentar pruebas, cómo se notifica la decisión, si se puede apelar) y su relación con los reclamos ante la justicia o la defensa del consumidor.

## 5. El contrato

- El contrato es público en la red de Stellar y su código está en el repositorio de Cryptoville.
- Si el contrato tiene que actualizarse, se anuncia con {{aviso_actualizacion_dias}} días de anticipación.
- El contrato tiene una pausa de emergencia que solo frena pedidos nuevos: nunca bloquea pagos, reembolsos ni vencimientos.
