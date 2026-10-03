import { useEffect, useRef, type ReactNode } from 'react';

/** Panel lateral (escritorio) u hoja inferior (celular). */
export function Panel({
  titulo,
  onCerrar,
  onAtras,
  children,
}: {
  titulo: ReactNode;
  onCerrar: () => void;
  onAtras?: () => void;
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

  return (
    <aside className="panel" ref={ref} tabIndex={-1} role="dialog" aria-label={typeof titulo === 'string' ? titulo : 'Panel'}>
      <header className="panel-cabecera">
        {onAtras ? (
          <button type="button" className="boton-icono" onClick={onAtras} aria-label="Volver">
            ←
          </button>
        ) : (
          <span />
        )}
        <h2>{titulo}</h2>
        <button type="button" className="boton-icono" onClick={onCerrar} aria-label="Cerrar">
          ✕
        </button>
      </header>
      <div className="panel-cuerpo">{children}</div>
    </aside>
  );
}
