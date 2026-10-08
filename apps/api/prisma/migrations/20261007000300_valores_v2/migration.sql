-- Valores nuevos de los enums para Cryptoville v2 (KYC, reportes, pagos por fases y pago directo).
-- Van solos en esta migración: Postgres no deja usar un valor nuevo de un enum en la misma transacción.

-- Pedidos por fases y pago directo.
ALTER TYPE "EstadoPedido" ADD VALUE IF NOT EXISTS 'finalizado';

ALTER TYPE "AccionPedido" ADD VALUE IF NOT EXISTS 'aceptar_plan';
ALTER TYPE "AccionPedido" ADD VALUE IF NOT EXISTS 'pagar_directo';
ALTER TYPE "AccionPedido" ADD VALUE IF NOT EXISTS 'confirmar_recibido';
ALTER TYPE "AccionPedido" ADD VALUE IF NOT EXISTS 'entregar_fase';
ALTER TYPE "AccionPedido" ADD VALUE IF NOT EXISTS 'liberar_fase';
ALTER TYPE "AccionPedido" ADD VALUE IF NOT EXISTS 'pedir_cambios';
ALTER TYPE "AccionPedido" ADD VALUE IF NOT EXISTS 'resolver_por_vencimiento';

-- Avisos nuevos.
ALTER TYPE "TipoAviso" ADD VALUE IF NOT EXISTS 'verificacion';
ALTER TYPE "TipoAviso" ADD VALUE IF NOT EXISTS 'reporte_resuelto';
ALTER TYPE "TipoAviso" ADD VALUE IF NOT EXISTS 'recordatorio';
ALTER TYPE "TipoAviso" ADD VALUE IF NOT EXISTS 'plan_propuesto';
ALTER TYPE "TipoAviso" ADD VALUE IF NOT EXISTS 'plan_aceptado';
ALTER TYPE "TipoAviso" ADD VALUE IF NOT EXISTS 'fase_entregada';
ALTER TYPE "TipoAviso" ADD VALUE IF NOT EXISTS 'fase_liberada';
ALTER TYPE "TipoAviso" ADD VALUE IF NOT EXISTS 'cambios_pedidos';
ALTER TYPE "TipoAviso" ADD VALUE IF NOT EXISTS 'pago_directo';
