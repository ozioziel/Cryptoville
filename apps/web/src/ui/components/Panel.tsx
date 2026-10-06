import { useEffect, useRef, type ReactNode } from 'react';
import { Icono } from './Iconos';

/**
 * Panel lateral (escritorio) u hoja inferior (celular).
 * Con `portada`, arriba va una franja de color (el degradado de la villa) en lugar del título.
 */
export function Panel({
  titulo,
  onCerrar,
  onAtras,
  portada,
  amplio = false,
  children,
}: {
  titulo: ReactNode;
  onCerrar: () => void;
  onAtras?: () => void;
  portada?: string;
  amplio?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [onCerrar]);

  const atras = onAtras && (
    <button type="button" className="boton-icono" onClick={onAtras} aria-label="Volver">
      <Icono nombre="atras" />
    </button>
  );
  const cerrar = (
    <button type="button" className="boton-icono" onClick={onCerrar} aria-label="Cerrar">
      <Icono nombre="cerrar" />
    </button>
  );

  return (
    <aside
      className={`panel ${amplio ? 'panel-amplio' : ''} ${portada ? 'con-portada' : ''}`}
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-label={typeof titulo === 'string' ? titulo : 'Panel'}
    >
      {portada ? (
        <div className="panel-acciones">
          {atras ?? <span />}
          {cerrar}
        </div>
      ) : (
        <header className="panel-cabecera">
          {atras ?? <span />}
          <h2>{titulo}</h2>
          {cerrar}
        </header>
      )}
      <div className="panel-cuerpo">
        {/* La portada va dentro del contenido para que el avatar pueda montarse sobre ella. */}
        {portada && <div className="panel-portada" style={{ background: portada }} />}
        {children}
      </div>
    </aside>
  );
}
