import type { Barrio } from '@cryptoville/shared';
import { useEstado } from '../estado';
import { Icono } from './Iconos';

/**
 * Desde un servicio, la búsqueda o una propuesta, dos botones: «Ir al local» y «Ir a su edificio»
 * (el CV de su dueña en la Plaza principal). El segundo solo aparece si la persona tiene edificio.
 */
export function BotonesIr({
  local,
  textoLocal = 'Ir al local',
  soloEdificio = false,
}: {
  local: { barrio: Barrio; lote: number; usuario_id: string };
  textoLocal?: string;
  /** Solo «Ir a su edificio» (por ejemplo, adentro del local). */
  soloEdificio?: boolean;
}) {
  const { irAlLocal, irAlEdificio, edificios, cerrar } = useEstado();
  const tieneEdificio = edificios.some((e) => e.usuarioId === local.usuario_id);
  return (
    <>
      {!soloEdificio && (
        <button
          type="button"
          className="boton boton-mini"
          onClick={() => {
            cerrar();
            irAlLocal(local);
          }}
        >
          {textoLocal} <Icono nombre="flecha" tamano={14} />
        </button>
      )}
      {tieneEdificio && (
        <button
          type="button"
          className="boton boton-mini"
          title="Su CV en la Plaza principal"
          onClick={() => {
            cerrar();
            irAlEdificio(local.usuario_id);
          }}
        >
          <Icono nombre="edificio" tamano={14} /> Ir a su edificio
        </button>
      )}
    </>
  );
}
