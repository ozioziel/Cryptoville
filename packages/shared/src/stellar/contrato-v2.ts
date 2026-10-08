// Datos del contrato de escrow v2 (contracts/escrow-v2): funciones, argumentos para Stellar Lab y errores.
// Si el contrato cambia, este es el archivo de la app que hay que actualizar (junto con contract.ts para el v1).
import { CONFIG_INICIAL } from './contract.js';
import type { ArgumentoContrato } from './contract.js';

/** Errores del contrato v2 (los del 1 al 10 son los mismos del v1). */
export const ERRORES_CONTRATO_V2: Record<number, { nombre: string; explicacion: string }> = {
  1: { nombre: 'PedidoYaExiste', explicacion: 'Ese número de pedido ya se usó en el contrato.' },
  2: { nombre: 'PedidoNoExiste', explicacion: 'El contrato no tiene un pedido con ese número.' },
  3: { nombre: 'EstadoInvalido', explicacion: 'La fase no está en el estado que permite esta acción.' },
  4: { nombre: 'MontoInvalido', explicacion: 'El monto debe ser mayor que cero.' },
  5: { nombre: 'FechaInvalida', explicacion: 'Las fechas tienen que estar en el futuro y en orden.' },
  6: { nombre: 'NoAutorizado', explicacion: 'Esa wallet no puede hacer esta acción en este pedido.' },
  7: { nombre: 'PlazoNoVencido', explicacion: 'Todavía no vence el plazo.' },
  8: { nombre: 'PlazoVencido', explicacion: 'El plazo ya pasó.' },
  9: { nombre: 'ComisionInvalida', explicacion: 'La comisión no puede pasar del 10% (1000 bps).' },
  10: { nombre: 'MismaCuenta', explicacion: 'El cliente y el proveedor no pueden ser la misma wallet.' },
  11: { nombre: 'Pausado', explicacion: 'El contrato está en pausa: por ahora no se pueden crear pedidos ni pagos nuevos.' },
  12: { nombre: 'TopeSuperado', explicacion: 'El monto pasa del tope por pedido.' },
  13: { nombre: 'PlanInvalido', explicacion: 'El plan tiene que tener entre 1 y 5 fases.' },
  14: { nombre: 'FaseNoExiste', explicacion: 'Esa fase no existe en el pedido.' },
  15: { nombre: 'FaseAnteriorPendiente', explicacion: 'Primero tienen que entregarse (o resolverse) las fases anteriores.' },
  16: { nombre: 'SinCambios', explicacion: 'Ya no se pueden pedir más cambios en esta fase.' },
  17: { nombre: 'SinActualizacion', explicacion: 'No hay una actualización del contrato pendiente.' },
  18: { nombre: 'AvisoNoCumplido', explicacion: 'Todavía no pasaron los 7 días de aviso de la actualización.' },
};

/** Funciones del contrato v2 que usa la app. */
export const FUNCIONES_V2 = [
  'crear_pedido',
  'pagar_directo',
  'entregar_fase',
  'liberar_fase',
  'pedir_cambios',
  'rechazar',
  'abrir_disputa',
  'resolver',
  'resolver_por_vencimiento',
  'cobrar_por_vencimiento',
  'reembolsar_por_vencimiento',
  'extender',
] as const;
export type FuncionV2 = (typeof FUNCIONES_V2)[number];

/** Valores por defecto del constructor del v2 (los mismos del archivo de reglas). */
export const CONFIG_INICIAL_V2 = {
  comision_bps: CONFIG_INICIAL.comision_bps,
  comision_directo_bps: 100,
  plazo_revision_seg: CONFIG_INICIAL.plazo_revision_seg,
  plazo_disputa_seg: 14 * 24 * 60 * 60,
} as const;

/** Argumentos del constructor del v2, para desplegarlo en Stellar Lab. */
export function argumentosConstructorV2(p: { admin: string; arbitro: string; token: string; tesoreria: string; topeUnidades: string }): ArgumentoContrato[] {
  return [
    { nombre: 'admin', tipo: 'Address', valor: p.admin, ayuda: 'Admin: configuración y actualizaciones (multifirma)' },
    { nombre: 'arbitro', tipo: 'Address', valor: p.arbitro, ayuda: 'Árbitro: resuelve disputas (multifirma, distinto del admin)' },
    { nombre: 'token', tipo: 'Address', valor: p.token, ayuda: 'Contrato del token (USDC de prueba en testnet, SAC del USDC en mainnet)' },
    { nombre: 'tesoreria', tipo: 'Address', valor: p.tesoreria, ayuda: 'Cuenta que recibe las comisiones' },
    { nombre: 'comision_bps', tipo: 'u32', valor: String(CONFIG_INICIAL_V2.comision_bps), ayuda: '3% = 300 puntos base' },
    { nombre: 'comision_directo_bps', tipo: 'u32', valor: String(CONFIG_INICIAL_V2.comision_directo_bps), ayuda: '1% = 100 puntos base' },
    { nombre: 'plazo_revision_seg', tipo: 'u64', valor: String(CONFIG_INICIAL_V2.plazo_revision_seg), ayuda: '3 días en segundos' },
    { nombre: 'plazo_disputa_seg', tipo: 'u64', valor: String(CONFIG_INICIAL_V2.plazo_disputa_seg), ayuda: '14 días en segundos' },
    { nombre: 'tope_pedido', tipo: 'i128', valor: p.topeUnidades, ayuda: 'Tope por pedido en unidades del token (0 = sin tope)' },
  ];
}
