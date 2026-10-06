import { BARRIOS, datosCuriososDe, type Barrio } from '@cryptoville/shared';
import { useMemo, useState } from 'react';
import { edificioCentral } from '../../arte/villa';
import { Icono } from '../components/Iconos';

/**
 * Datos curiosos del edificio central de la villa (cine, galería, torre o biblioteca).
 * Es solo decoración: no tiene lógica de negocio.
 */
export function PanelDatosCuriosos({ barrio }: { barrio: Barrio }) {
  // Se mezclan una vez al entrar, para que cada visita empiece con otro dato.
  const datos = useMemo(() => {
    const lista = datosCuriososDe(barrio);
    const inicio = Math.floor(Math.random() * lista.length);
    return [...lista.slice(inicio), ...lista.slice(0, inicio)];
  }, [barrio]);
  const [i, setI] = useState(0);
  const dato = datos[i];
  const edificio = edificioCentral(barrio);

  return (
    <div className="local">
      <div className="local-avatar local-icono" style={{ color: BARRIOS[barrio].colorOscuro }}>
        <Icono nombre="foco" tamano={34} />
      </div>
      <div>
        <h2 className="local-nombre">{edificio.nombre}</h2>
        <p className="tenue">Datos curiosos · Villa {BARRIOS[barrio].nombre}</p>
      </div>
      <figure className="dato-curioso" aria-live="polite">
        <span className="chip" style={{ background: BARRIOS[barrio].colorSuave, color: BARRIOS[barrio].colorOscuro }}>
          {dato.tema === 'stellar' ? 'Stellar' : dato.tema === 'general' ? 'General' : `Villa ${BARRIOS[dato.tema].nombre}`}
        </span>
        <blockquote>{dato.texto}</blockquote>
        <figcaption>
          <a href={dato.fuente} target="_blank" rel="noreferrer">
            Fuente <Icono nombre="enlace" tamano={14} />
          </a>
        </figcaption>
      </figure>
      <div className="fila espaciada">
        <button type="button" className="boton" onClick={() => setI((i - 1 + datos.length) % datos.length)} aria-label="Dato anterior">
          <Icono nombre="atras" />
        </button>
        <span className="tenue pequeno">
          {i + 1} de {datos.length}
        </span>
        <button type="button" className="boton boton-primario" onClick={() => setI((i + 1) % datos.length)}>
          Otro dato <Icono nombre="flecha" />
        </button>
      </div>
    </div>
  );
}
