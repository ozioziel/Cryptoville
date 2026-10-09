import { useEffect, useRef, type ReactNode } from 'react';
import { Icono } from './Iconos';

/**
 * Panel lateral (escritorio) u hoja inferior (celular).
 * Con `portada`, arriba va una franja de color (el degradado de la villa) en lugar del título.
 * Con `onAlternarCompleto`, la cabecera lleva un botón para agrandarlo a pantalla completa (y volver);
 * `lateral` se muestra al costado solo cuando está a pantalla completa.
 */
export function Panel({
  titulo,
  onCerrar,
  onAtras,
  portada,
  amplio = false,
  completo = false,
  onAlternarCompleto,
  lateral,
  children,
}: {
  titulo: ReactNode;
  onCerrar: () => void;
  onAtras?: () => void;
  portada?: string;
  amplio?: boolean;
  completo?: boolean;
  onAlternarCompleto?: () => void;
  lateral?: ReactNode;
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
    <span className="panel-botones">
      {onAlternarCompleto && (
        <button
          type="button"
          className="boton-icono"
          onClick={onAlternarCompleto}
          aria-pressed={completo}
          aria-label={completo ? 'Volver al tamaño normal' : 'Agrandar a pantalla completa'}
          title={completo ? 'Volver al tamaño normal' : 'Agrandar a pantalla completa'}
        >
          <Icono nombre={completo ? 'reducir' : 'agrandar'} />
        </button>
      )}
      <button type="button" className="boton-icono" onClick={onCerrar} aria-label="Cerrar">
        <Icono nombre="cerrar" />
      </button>
    </span>
  );

  const cuerpo = (
    <div className="panel-cuerpo">
      {/* La portada va dentro del contenido para que el avatar pueda montarse sobre ella. */}
      {portada && <div className="panel-portada" style={{ background: portada }} />}
      {children}
    </div>
  );

  return (
    <aside
      className={`panel ${amplio ? 'panel-amplio' : ''} ${completo ? 'panel-completo' : ''} ${portada ? 'con-portada' : ''}`}
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
      {completo && lateral ? (
        <div className="panel-con-lateral">
          <div className="panel-lateral">{lateral}</div>
          {cuerpo}
        </div>
      ) : (
        cuerpo
      )}
    </aside>
  );
}
