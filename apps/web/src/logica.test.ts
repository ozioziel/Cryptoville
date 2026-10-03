// Pruebas de la lógica de la web (sin navegador): firma local, búsqueda, pasos del pedido y zoom.
import { Keypair } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { accionesPara, argumentosPara, rolEnPedido } from './features/escrow/pasos';
import { firmanteDesdeSecreta, hashSep53 } from './features/auth/firma-local';
import type { PedidoDetalle } from './features/orders/datos';
import { buscarServicios } from './features/services/buscar';
import type { LocalDelPueblo } from './features/services/datos';
import { zoomPara } from './game/zoom';

describe('firma local (modo desarrollo)', () => {
  it('deriva la misma dirección que stellar-sdk y firma SEP-53 verificable', async () => {
    const par = Keypair.random();
    const firmante = await firmanteDesdeSecreta(par.secret());
    expect(firmante.direccion).toBe(par.publicKey());
    const mensaje = 'Cryptoville: iniciar sesión\nCódigo: abc';
    const firma = Buffer.from(await firmante.firmar(mensaje), 'base64');
    expect(par.verify(Buffer.from(hashSep53(mensaje)), firma)).toBe(true);
  });

  it('rechaza llaves con checksum incorrecto', async () => {
    const secreta = Keypair.random().secret();
    const mala = secreta.slice(0, -1) + (secreta.endsWith('A') ? 'B' : 'A');
    await expect(firmanteDesdeSecreta(mala)).rejects.toThrow();
    await expect(firmanteDesdeSecreta(Keypair.random().publicKey())).rejects.toThrow();
  });
});

const usuario = (id: string, nombre: string) => ({ id, nombre, avatar: 85, direccion: 'G'.padEnd(56, 'A'), bio: null, rol: 'usuario' as const });
const local = (id: string, barrio: 'diseno' | 'clases', nota: number | null, servicios: [string, string][]): LocalDelPueblo => ({
  id,
  usuario_id: `u-${id}`,
  nombre: `Local ${id}`,
  barrio,
  lote: 1,
  color: '#fff',
  descripcion: null,
  activo: true,
  usuario: usuario(`u-${id}`, `Persona ${id}`),
  reputacion: nota === null ? null : { usuario_id: `u-${id}`, calificacion: nota, total_resenas: 1, completados: 1, disputas_ganadas: 0, disputas_perdidas: 0, nivel: 'Nuevo' },
  servicios: servicios.map(([titulo, precio], i) => ({
    id: `${id}-${i}`,
    local_id: id,
    titulo,
    descripcion: 'Descripción',
    precio_usdc: precio,
    dias_entrega: 3,
    foto_url: null,
    activo: true,
  })),
});

describe('buscador', () => {
  const locales = [
    local('a', 'diseno', 4, [['Diseño de logo', '40'], ['Ilustración', '25']]),
    local('b', 'clases', 5, [['Clase de inglés', '12'], ['Logotipo express', '15']]),
  ];
  it('busca sin importar acentos ni mayúsculas', () => {
    expect(buscarServicios(locales, { texto: 'DISENO', barrio: 'todos', precioMaximo: null }).map((r) => r.servicio.titulo)).toEqual(['Diseño de logo']);
  });
  it('filtra por barrio y precio y ordena por reputación', () => {
    expect(buscarServicios(locales, { texto: 'logo', barrio: 'todos', precioMaximo: null }).map((r) => r.servicio.titulo)).toEqual([
      'Logotipo express',
      'Diseño de logo',
    ]);
    expect(buscarServicios(locales, { texto: '', barrio: 'diseno', precioMaximo: 30 }).map((r) => r.servicio.titulo)).toEqual(['Ilustración']);
  });
});

const G_CLIENTE = Keypair.random().publicKey();
const G_PROV = Keypair.random().publicKey();
const pedido = (estado: PedidoDetalle['estado'], extra: Partial<PedidoDetalle> = {}): PedidoDetalle => ({
  id: 'p',
  numero: 1791054364005,
  servicio_id: 's',
  cliente_id: 'c',
  proveedor_id: 'v',
  estado,
  monto_usdc: '10',
  detalle: 'x',
  fecha_limite: new Date(Date.now() + 86_400_000).toISOString(),
  creado_en: new Date().toISOString(),
  actualizado_en: new Date().toISOString(),
  es_ejemplo: false,
  servicio: { titulo: 'Servicio' },
  cliente: { ...usuario('c', 'Cliente'), direccion: G_CLIENTE },
  proveedor: { ...usuario('v', 'Proveedor'), direccion: G_PROV },
  pasos: [],
  mensajes: [],
  disputa: null,
  resenas: [],
  ...extra,
});

describe('pasos del pedido', () => {
  it('rol en el pedido', () => {
    expect(rolEnPedido(pedido('pagado'), 'c', false)).toBe('cliente');
    expect(rolEnPedido(pedido('pagado'), 'otro', true)).toBe('arbitro');
    expect(rolEnPedido(pedido('pagado'), 'otro', false)).toBeNull();
  });

  it('lo principal primero; cancelar y disputar al final', () => {
    expect(accionesPara(pedido('aceptado'), 'cliente', 259200).map((a) => a.def.accion)).toEqual(['crear_pedido', 'cancelar']);
    expect(accionesPara(pedido('pagado'), 'proveedor', 259200).map((a) => a.def.accion)).toEqual(['marcar_entregado', 'rechazar', 'abrir_disputa']);
  });

  it('las acciones por vencimiento aparecen solo cuando aplican', () => {
    const vencido = pedido('pagado', { fecha_limite: new Date(Date.now() - 1000).toISOString() });
    expect(accionesPara(pedido('pagado'), 'cliente', 259200).map((a) => a.def.accion)).not.toContain('reembolsar_por_vencimiento');
    expect(accionesPara(vencido, 'cliente', 259200).map((a) => a.def.accion)).toContain('reembolsar_por_vencimiento');
    const entregado = pedido('entregado', {
      pasos: [{ id: '1', pedido_id: 'p', accion: 'marcar_entregado', hash: null, declarado_por: 'v', verificado_por: null, verificado_en: null, creado_en: new Date(Date.now() - 4 * 86_400_000).toISOString() }],
    });
    expect(accionesPara(entregado, 'proveedor', 259200).map((a) => a.def.accion)).toContain('cobrar_por_vencimiento');
  });

  it('los pedidos de ejemplo no tienen acciones', () => {
    expect(accionesPara(pedido('aceptado', { es_ejemplo: true }), 'cliente', 259200)).toEqual([]);
  });

  it('argumentos para el Lab con las direcciones reales', () => {
    const args = argumentosPara(pedido('aceptado'), 'crear_pedido', G_CLIENTE, null);
    expect(args.map((a) => a.valor).slice(0, 4)).toEqual([G_CLIENTE, G_PROV, '1791054364005', '100000000']);
  });
});

describe('zoom del pueblo', () => {
  it('nunca menos de 2 ni más de 5, y entero', () => {
    expect(zoomPara(375, 812)).toBe(2);
    expect(zoomPara(1920, 1080)).toBeGreaterThanOrEqual(4);
    expect(zoomPara(8000, 8000)).toBe(5);
    expect(Number.isInteger(zoomPara(1280, 720))).toBe(true);
  });
});
