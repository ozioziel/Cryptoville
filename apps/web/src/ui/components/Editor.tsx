import type { OpcionPieza } from '@cryptoville/shared';
import { useId, type ReactNode } from 'react';

/**
 * Selector de una pieza del editor (persona o casa): botones de texto o muestras de color.
 * Siempre es una lista cerrada (no hay selector libre de color).
 */
export function SelectorPieza({
  etiqueta,
  opciones,
  valor,
  onCambiar,
  vista,
}: {
  etiqueta: string;
  opciones: readonly OpcionPieza[];
  valor: string;
  onCambiar: (id: string) => void;
  /** Vista previa pequeña de cada opción (opcional). */
  vista?: (id: string) => ReactNode;
}) {
  const id = useId();
  const sonColores = opciones.every((o) => o.color) && !vista;
  return (
    <div className="editor-grupo" role="radiogroup" aria-labelledby={id}>
      <span className="etiqueta" id={id}>
        {etiqueta}
      </span>
      <div className={sonColores ? 'muestras' : 'opciones'}>
        {opciones.map((o) =>
          sonColores ? (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={o.id === valor}
              aria-label={o.nombre}
              title={o.nombre}
              className={`muestra-color ${o.id === valor ? 'activo' : ''}`}
              style={{ background: o.color }}
              onClick={() => onCambiar(o.id)}
            />
          ) : (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={o.id === valor}
              className={`opcion ${o.id === valor ? 'activa' : ''} ${vista ? 'con-vista' : ''}`}
              onClick={() => onCambiar(o.id)}
            >
              {vista?.(o.id)}
              <span>{o.nombre}</span>
            </button>
          ),
        )}
      </div>
    </div>
  );
}

/** Pestañas simples (por ejemplo, Exterior / Interior de la casa). */
export function Pestanas<T extends string>({
  opciones,
  valor,
  onCambiar,
  etiqueta,
}: {
  opciones: readonly { id: T; nombre: string }[];
  valor: T;
  onCambiar: (v: T) => void;
  etiqueta: string;
}) {
  return (
    <div className="pestanas" role="tablist" aria-label={etiqueta}>
      {opciones.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={o.id === valor} className={o.id === valor ? 'activa' : ''} onClick={() => onCambiar(o.id)}>
          {o.nombre}
        </button>
      ))}
    </div>
  );
}
