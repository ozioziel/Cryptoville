import { aparienciaDeUsuario, type AparienciaPersona } from '@cryptoville/shared';
import { useMemo } from 'react';
import { crearLapiz, crearLibroAbierto } from '../../arte/escribir';
import { crearPersona } from '../../arte/persona';

/** Tu personaje escribiendo en su libro (al costado de «Mis pedidos» a pantalla completa). Solo decorativo. */
export function Escribiendo({ avatar, apariencia }: { avatar: number; apariencia: AparienciaPersona | null }) {
  const svg = useMemo(
    () => ({
      persona: crearPersona(aparienciaDeUsuario({ avatar, apariencia })),
      libro: crearLibroAbierto(),
      lapiz: crearLapiz(),
    }),
    [avatar, apariencia],
  );
  return (
    <div className="escribiendo" aria-hidden="true">
      <div className="escribiendo-persona" dangerouslySetInnerHTML={{ __html: svg.persona }} />
      <div className="escribiendo-libro" dangerouslySetInnerHTML={{ __html: svg.libro }} />
      <div className="escribiendo-lapiz" dangerouslySetInnerHTML={{ __html: svg.lapiz }} />
    </div>
  );
}
