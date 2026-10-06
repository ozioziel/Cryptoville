import { BARRIOS, ETIQUETA_ESTADO_BUSQUEDA, aceptaPropuestas, nombreCategoria } from '@cryptoville/shared';
import { CLASE_ESTADO_BUSQUEDA, type BusquedaPublica } from '../../features/busquedas/datos';
import { chipDe } from '../villas';
import { Avatar, fechaDia } from './basicos';
import { Icono } from './Iconos';

/**
 * Cartel «Se busca»: hoja crema con chincheta y detalles mostaza (los servicios siguen en coral).
 * Arriba: título, presupuesto y fecha límite. Abajo: quién lo publicó y cuántas propuestas tiene.
 */
export function CartelSeBusca({ busqueda: b, onAbrir }: { busqueda: BusquedaPublica; onAbrir?: () => void }) {
  const vencida = b.estado === 'abierta' && !aceptaPropuestas(b);
  const contenido = (
    <>
      <span className="cartel-chincheta" aria-hidden="true" />
      <span className="cartel-cabecera">SE BUSCA</span>
      <span className="cartel-titulo">{b.titulo}</span>
      <span className="cartel-datos">
        <span>
          <span className="cartel-etiqueta">Presupuesto</span>
          <span className="precio">{b.presupuesto_usdc} USDC</span>
        </span>
        <span className="cartel-fecha">
          <Icono nombre="reloj" tamano={15} />
          Para el {fechaDia(b.fecha_limite)}
        </span>
      </span>
      <span className="cartel-pie">
        <span className="fila pequeno">
          <Avatar frame={b.autor.avatar} apariencia={b.autor.apariencia} tamano={24} titulo={b.autor.nombre} />
          {b.autor.nombre}
        </span>
        <span className="chip" style={chipDe(b.barrio)} title={`Villa ${BARRIOS[b.barrio].nombre}`}>
          {nombreCategoria(b.categoria)}
        </span>
        <span className="cartel-propuestas">
          {b.total_propuestas} {b.total_propuestas === 1 ? 'propuesta' : 'propuestas'}
        </span>
      </span>
      {(b.estado !== 'abierta' || vencida) && (
        <span className={`badge badge-${vencida ? 'apagado' : CLASE_ESTADO_BUSQUEDA[b.estado]} cartel-estado`}>
          {vencida ? 'Venció' : ETIQUETA_ESTADO_BUSQUEDA[b.estado]}
        </span>
      )}
    </>
  );
  return onAbrir ? (
    <button type="button" className="cartel" onClick={onAbrir} aria-label={`Se busca: ${b.titulo}`}>
      {contenido}
    </button>
  ) : (
    <div className="cartel">{contenido}</div>
  );
}
