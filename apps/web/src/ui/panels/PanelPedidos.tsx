import { esFinal } from '@cryptoville/shared';
import { useEffect, useState } from 'react';
import { useSesion } from '../../features/auth/sesion';
import { cargarMisPedidos, type PedidoResumen } from '../../features/orders/datos';
import { mensajeDeError } from '../../lib/api';
import { useEstado } from '../estado';
import { Aviso, Avatar, Cargando, EstadoPedidoBadge, fechaCorta } from '../components/basicos';

export function PanelPedidos() {
  const { usuario } = useSesion();
  const { abrir, version } = useEstado();
  const [pedidos, setPedidos] = useState<PedidoResumen[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verCerrados, setVerCerrados] = useState(false);

  useEffect(() => {
    if (!usuario) return;
    cargarMisPedidos(usuario.id).then(setPedidos, (e) => setError(mensajeDeError(e)));
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
                  <Avatar frame={otro.avatar} tamano={18} /> {otro.nombre} · {p.monto_usdc} USDC · {fechaCorta(p.actualizado_en)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );

  return (
    <div className="pila">
      <label className="fila pequeno">
        <input type="checkbox" checked={verCerrados} onChange={(e) => setVerCerrados(e.target.checked)} /> Mostrar pedidos cerrados
      </label>
      {grupo('Lo que contraté', visibles.filter((p) => p.cliente_id === usuario.id), true)}
      {grupo('Lo que me pidieron', visibles.filter((p) => p.proveedor_id === usuario.id), false)}
    </div>
  );
}
