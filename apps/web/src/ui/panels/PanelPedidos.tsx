import { ETIQUETA_ESTADO_BUSQUEDA, ETIQUETA_ESTADO_PROPUESTA, esFinal, type Busqueda } from '@cryptoville/shared';
import { useEffect, useState } from 'react';
import { useSesion } from '../../features/auth/sesion';
import { CLASE_ESTADO_BUSQUEDA, cargarMisPropuestas, cargarMisSeBusca, type PropuestaPropia } from '../../features/busquedas/datos';
import { cargarMisPedidos, type PedidoResumen } from '../../features/orders/datos';
import { mensajeDeError } from '../../lib/api';
import { useEstado } from '../estado';
import { Aviso, Avatar, Cargando, EstadoPedidoBadge, fechaCorta, fechaDia } from '../components/basicos';
import { Icono } from '../components/Iconos';

export function PanelPedidos() {
  const { usuario } = useSesion();
  const { abrir, version } = useEstado();
  const [pedidos, setPedidos] = useState<PedidoResumen[] | null>(null);
  const [seBusca, setSeBusca] = useState<Busqueda[]>([]);
  const [propuestas, setPropuestas] = useState<PropuestaPropia[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [verCerrados, setVerCerrados] = useState(false);

  useEffect(() => {
    if (!usuario) return;
    cargarMisPedidos(usuario.id).then(setPedidos, (e) => setError(mensajeDeError(e)));
    // Los «Se busca» y las propuestas propias también se siguen desde aquí.
    cargarMisSeBusca(usuario.id).then(setSeBusca, () => setSeBusca([]));
    cargarMisPropuestas(usuario.id).then(setPropuestas, () => setPropuestas([]));
  }, [usuario, version]);

  if (!usuario) return <p className="tenue">Entra con tu wallet para ver tus pedidos.</p>;
  if (error) return <Aviso tipo="peligro">{error}</Aviso>;
  if (!pedidos) return <Cargando />;

  const visibles = pedidos.filter((p) => verCerrados || !esFinal(p.estado));
  const grupo = (titulo: string, lista: PedidoResumen[], comoCliente: boolean) => (
    <>
      <h3>{titulo}</h3>
      {lista.length === 0 && <p className="tenue">Nada por aquí.</p>}
      <ul className="lista-tarjetas">
        {lista.map((p) => {
          const otro = comoCliente ? p.proveedor : p.cliente;
          return (
            <li key={p.id}>
              <button type="button" className="tarjeta" onClick={() => abrir({ tipo: 'pedido', id: p.id })}>
                <span className="fila espaciada">
                  <span className="tarjeta-titulo">{p.servicio.titulo}</span>
                  <EstadoPedidoBadge estado={p.estado} />
                </span>
                <span className="fila pequeno">
                  <Avatar frame={otro.avatar} apariencia={otro.apariencia} tamano={22} /> {otro.nombre} · {p.monto_usdc} USDC · {fechaCorta(p.actualizado_en)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );

  const misSeBusca = seBusca.filter((b) => verCerrados || b.estado === 'abierta');
  const misPropuestas = propuestas.filter((p) => verCerrados || p.estado === 'enviada');

  return (
    <div className="pila">
      <label className="fila pequeno casilla">
        <input type="checkbox" checked={verCerrados} onChange={(e) => setVerCerrados(e.target.checked)} /> Mostrar pedidos cerrados
      </label>
      {grupo('Lo que contraté', visibles.filter((p) => p.cliente_id === usuario.id), true)}
      {grupo('Lo que me pidieron', visibles.filter((p) => p.proveedor_id === usuario.id), false)}

      <h3>
        <Icono nombre="chincheta" /> Mis «Se busca»
      </h3>
      {misSeBusca.length === 0 && <p className="tenue">No tienes «Se busca» abiertos.</p>}
      <ul className="lista-tarjetas">
        {misSeBusca.map((b) => (
          <li key={b.id}>
            <button type="button" className="tarjeta tarjeta-se-busca" onClick={() => abrir({ tipo: 'busqueda', id: b.id })}>
              <span className="fila espaciada">
                <span className="tarjeta-titulo">{b.titulo}</span>
                <span className={`badge badge-${CLASE_ESTADO_BUSQUEDA[b.estado]}`}>{ETIQUETA_ESTADO_BUSQUEDA[b.estado]}</span>
              </span>
              <span className="tenue pequeno">
                {b.total_propuestas} {b.total_propuestas === 1 ? 'propuesta' : 'propuestas'} · hasta {b.presupuesto_usdc} USDC · para el {fechaDia(b.fecha_limite)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <h3>
        <Icono nombre="maletin" /> Mis propuestas
      </h3>
      {misPropuestas.length === 0 && <p className="tenue">No tienes propuestas pendientes.</p>}
      <ul className="lista-tarjetas">
        {misPropuestas.map((p) => (
          <li key={p.id}>
            <button type="button" className="tarjeta tarjeta-se-busca" onClick={() => abrir({ tipo: 'busqueda', id: p.busqueda_id })}>
              <span className="fila espaciada">
                <span className="tarjeta-titulo">{p.busqueda?.titulo ?? '«Se busca»'}</span>
                <span className={`badge badge-${p.estado === 'aceptada' ? 'exito' : p.estado === 'enviada' ? 'info' : 'apagado'}`}>{ETIQUETA_ESTADO_PROPUESTA[p.estado]}</span>
              </span>
              <span className="tenue pequeno">
                Tu propuesta: {p.monto_usdc} USDC · entrega en {p.dias_entrega} {p.dias_entrega === 1 ? 'día' : 'días'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
