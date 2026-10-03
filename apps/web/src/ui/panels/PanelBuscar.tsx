import { BARRIOS, type Barrio } from '@cryptoville/shared';
import { useMemo, useState } from 'react';
import { buscarServicios } from '../../features/services/buscar';
import { emitir } from '../../game/EventBus';
import { useEstado } from '../estado';
import { Avatar, Estrellas } from '../components/basicos';

export function PanelBuscar() {
  const { locales, abrir, cerrar } = useEstado();
  const [texto, setTexto] = useState('');
  const [barrio, setBarrio] = useState<Barrio | 'todos'>('todos');
  const [precio, setPrecio] = useState('');
  const resultados = useMemo(
    () => buscarServicios(locales, { texto, barrio, precioMaximo: precio ? Number(precio) : null }),
    [locales, texto, barrio, precio],
  );

  return (
    <div className="pila">
      <input
        className="campo"
        type="search"
        placeholder="¿Qué buscas? logo, inglés, página web…"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        autoFocus
      />
      <div className="fila">
        <select className="campo" value={barrio} onChange={(e) => setBarrio(e.target.value as Barrio | 'todos')} aria-label="Barrio">
          <option value="todos">Todos los barrios</option>
          {(Object.keys(BARRIOS) as Barrio[]).map((b) => (
            <option key={b} value={b}>
              {BARRIOS[b].nombre}
            </option>
          ))}
        </select>
        <input className="campo" inputMode="decimal" placeholder="Precio máx." value={precio} onChange={(e) => setPrecio(e.target.value)} aria-label="Precio máximo en USDC" />
      </div>
      <p className="tenue pequeno">
        {resultados.length} {resultados.length === 1 ? 'servicio' : 'servicios'}
      </p>
      <ul className="lista-tarjetas">
        {resultados.map(({ servicio, local }) => (
          <li key={servicio.id} className="tarjeta">
            <span className="fila espaciada">
              <span className="tarjeta-titulo">{servicio.titulo}</span>
              <span className="tarjeta-precio">{servicio.precio_usdc} USDC</span>
            </span>
            <span className="fila pequeno">
              <Avatar frame={local.usuario.avatar} tamano={18} /> {local.usuario.nombre} · {BARRIOS[local.barrio].nombre} ·{' '}
              <Estrellas valor={local.reputacion?.calificacion ?? null} />
            </span>
            <span className="fila">
              <button type="button" className="boton boton-mini" onClick={() => abrir({ tipo: 'servicio', servicioId: servicio.id })}>
                Ver servicio
              </button>
              <button
                type="button"
                className="boton boton-mini"
                onClick={() => {
                  cerrar();
                  emitir('ir-a-lote', local.lote);
                }}
              >
                Ir al local
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
