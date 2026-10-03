import { useEffect, useState } from 'react';
import { useSesion } from '../../features/auth/sesion';
import { cargarDisputas, type DisputaArbitro } from '../../features/orders/datos';
import { mensajeDeError } from '../../lib/api';
import { useEstado } from '../estado';
import { Aviso, Cargando, EstadoPedidoBadge, fechaCorta } from '../components/basicos';

/** Disputas abiertas y resueltas. Para resolver, se abre el pedido y se usa «Resolver disputa». */
export function PanelArbitro() {
  const { usuario } = useSesion();
  const { abrir, version } = useEstado();
  const [disputas, setDisputas] = useState<DisputaArbitro[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    cargarDisputas().then(setDisputas, (e) => setError(mensajeDeError(e)));
  }, [version]);

  if (usuario?.rol !== 'arbitro') return <Aviso tipo="peligro">Solo el árbitro puede ver este panel.</Aviso>;
  if (error) return <Aviso tipo="peligro">{error}</Aviso>;
  if (!disputas) return <Cargando />;

  const abiertas = disputas.filter((d) => !d.ganador);
  const resueltas = disputas.filter((d) => d.ganador);
  const lista = (items: DisputaArbitro[]) => (
    <ul className="lista-tarjetas">
      {items.map((d) => (
        <li key={d.id}>
          <button type="button" className="tarjeta" onClick={() => abrir({ tipo: 'pedido', id: d.pedido_id })}>
            <span className="fila espaciada">
              <span className="tarjeta-titulo">
                #{d.pedido.numero} · {d.pedido.servicio.titulo}
              </span>
              <EstadoPedidoBadge estado={d.pedido.estado} />
            </span>
            <span className="pequeno">
              {d.pedido.cliente.nombre} (cliente) vs. {d.pedido.proveedor.nombre} (proveedor) · {d.pedido.monto_usdc} USDC
            </span>
            <span className="tenue pequeno">
              «{d.motivo}» · {fechaCorta(d.creado_en)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="pila">
      <p className="tenue pequeno">
        Revisa el chat y el historial del pedido. Resuelve en Stellar Lab con la función <code>resolver</code> (firmando con la wallet admin del
        contrato) y registra el hash.
      </p>
      <h3>Abiertas ({abiertas.length})</h3>
      {abiertas.length ? lista(abiertas) : <p className="tenue">No hay disputas abiertas.</p>}
      <h3>Resueltas ({resueltas.length})</h3>
      {lista(resueltas)}
    </div>
  );
}
