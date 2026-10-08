import { useState } from 'react';
import { useSesion } from '../../features/auth/sesion';
import { api, mensajeDeError } from '../../lib/api';
import { useEstado } from '../estado';

/** Qué se puede reportar (lo mismo que acepta la API). */
export type TipoReporte = 'local' | 'foto' | 'busqueda' | 'resena' | 'mensaje' | 'persona' | 'proyecto' | 'chat';

/** Insignia ✔: la persona verificó su identidad (es real y tiene una sola cuenta). */
export function Verificado({ si, tamano = 14 }: { si?: boolean | null; tamano?: number }) {
  if (!si) return null;
  return (
    <span className="verificado" title="Verificó su identidad: es una persona real y tiene una sola cuenta" aria-label="Verificado" style={{ width: tamano, height: tamano }}>
      <svg viewBox="0 0 16 16" width={tamano} height={tamano} aria-hidden="true" focusable="false">
        <circle cx="8" cy="8" r="8" fill="currentColor" />
        <path d="M4.6 8.3L7 10.6L11.5 5.8" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/** Nombre de una persona con su insignia (si está verificada). */
export function Nombre({ nombre, verificado, fuerte = false }: { nombre: string; verificado?: boolean | null; fuerte?: boolean }) {
  const Etiqueta = fuerte ? 'strong' : 'span';
  return (
    <Etiqueta className="nombre-con-insignia">
      {nombre}
      <Verificado si={verificado} />
    </Etiqueta>
  );
}

/** Enlace chico "Reportar": abre el formulario de reporte. */
export function BotonReportar({ tipo, objetoId, nombre }: { tipo: TipoReporte; objetoId: string; nombre: string }) {
  const { usuario } = useSesion();
  const { abrir } = useEstado();
  if (!usuario) return null;
  return (
    <button type="button" className="enlace enlace-peligro" onClick={() => abrir({ tipo: 'reportar', reporte: tipo, objetoId, nombre })}>
      Reportar
    </button>
  );
}

/** Bloquear (o desbloquear) a una persona: no te puede hablar ni mandarte pedidos ni propuestas. */
export function BotonBloquear({
  usuarioId,
  nombre,
  bloqueado: inicial = false,
  onCambio,
}: {
  usuarioId: string;
  nombre: string;
  bloqueado?: boolean;
  /** Después de bloquear o desbloquear (por ejemplo, para cerrar el chat). */
  onCambio?: (bloqueado: boolean) => void;
}) {
  const { usuario } = useSesion();
  const { avisar, refrescar } = useEstado();
  const [bloqueado, setBloqueado] = useState(inicial);
  const [ocupado, setOcupado] = useState(false);
  if (!usuario || usuario.id === usuarioId) return null;
  return (
    <button
      type="button"
      className="enlace enlace-peligro"
      disabled={ocupado}
      onClick={async () => {
        if (!bloqueado && !window.confirm(`¿Bloquear a ${nombre}? No podrá hablarte ni mandarte pedidos ni propuestas.`)) return;
        setOcupado(true);
        try {
          if (bloqueado) await api(`/bloqueos/${usuarioId}`, { metodo: 'DELETE' });
          else await api('/bloqueos', { cuerpo: { usuario_id: usuarioId } });
          setBloqueado(!bloqueado);
          avisar(bloqueado ? `Desbloqueaste a ${nombre}` : `Bloqueaste a ${nombre}`, 'exito');
          // Las personas en línea vuelven a leer los bloqueos (la bloqueada deja de verse en la villa).
          refrescar();
          onCambio?.(!bloqueado);
        } catch (e) {
          avisar(mensajeDeError(e), 'error');
        } finally {
          setOcupado(false);
        }
      }}
    >
      {bloqueado ? 'Desbloquear' : 'Bloquear'}
    </button>
  );
}
