---
version: 2026-10-07
---
# Comisiones y reglas

Estos números salen del archivo de reglas de WorkVille (`packages/shared/src/reglas.ts`). Si el equipo los cambia, esta página cambia sola.

## Comisiones

| Método | Comisión |
|---|---|
| Pagar directo (sin garantía) | {{comision_directo}} |
| Pagar con garantía | {{comision_garantia}} |
| Por etapas | {{comision_etapas}} de cada fase |
| Local extra (desde el {{local_extra_numero}}.º) | {{precio_local_extra}}, pago único |

- La comisión se descuenta de lo que cobra el proveedor. El cliente paga el precio acordado.
- La red de Stellar cobra fracciones de centavo por transacción (en XLM).

## Plazos

- Plazo de revisión del cliente después de cada entrega: {{plazo_revision_dias}} días.
- Plazo máximo de una disputa: {{plazo_disputa_dias}} días (después se reparte 50/50).
- Aviso antes de actualizar el contrato: {{aviso_actualizacion_dias}} días.

## Límites

- Fases por pedido: hasta {{fases_max}}; cambios por fase: {{cambios_por_fase}}.
- Tope por pedido: {{tope_pedido}}.
- Locales por persona: {{locales_gratis}} gratis, hasta {{locales_maximo}}.
- Casas por villa: {{casas_por_sector}}; después se abre otro sector (por ejemplo, «Creativo B»).
- Pruebas: archivos de hasta {{prueba_max_mb}} MB.
- Chat por cercanía: se guarda {{chat_dias}} días.

## KYC

Se exige para: {{kyc_para}}.

> [!ABOGADO] Revisar si las comisiones deben mostrarse con impuestos incluidos y si hace falta emitir comprobantes por ellas.
