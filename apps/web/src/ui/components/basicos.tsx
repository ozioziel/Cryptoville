import { ETIQUETA_ESTADO, type EstadoPedido } from '@cryptoville/shared';
import { useState, type ReactNode } from 'react';

/** Personaje de Kenney Tiny Dungeon recortado del tilesheet. */
export function Avatar({ frame, tamano = 32, titulo }: { frame: number; tamano?: number; titulo?: string }) {
  const escala = tamano / 16;
  return (
    <span
      className="avatar"
      role="img"
      aria-label={titulo ?? 'Personaje'}
      title={titulo}
      style={{
        width: tamano,
        height: tamano,
        backgroundSize: `${192 * escala}px ${176 * escala}px`,
        backgroundPosition: `-${(frame % 12) * 16 * escala}px -${Math.floor(frame / 12) * 16 * escala}px`,
      }}
    />
  );
}

/** Botón que copia un texto al portapapeles. */
export function Copiar({ texto, etiqueta = 'Copiar' }: { texto: string; etiqueta?: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      className="boton boton-mini"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
        } catch {
          const area = document.createElement('textarea');
          area.value = texto;
          document.body.appendChild(area);
          area.select();
          document.execCommand('copy');
          area.remove();
        }
        setCopiado(true);
        setTimeout(() => setCopiado(false), 1500);
      }}
    >
      {copiado ? '¡Copiado!' : etiqueta}
    </button>
  );
}

export function Estrellas({ valor, total }: { valor: number | null; total?: number }) {
  if (valor === null) return <span className="tenue">Sin reseñas</span>;
  const llenas = Math.round(valor);
  return (
    <span className="estrellas" aria-label={`${valor.toFixed(1)} de 5`}>
      {'★'.repeat(llenas)}
      <span className="tenue">{'★'.repeat(5 - llenas)}</span> {valor.toFixed(1)}
      {total !== undefined && <span className="tenue"> ({total})</span>}
    </span>
  );
}

const CLASE_ESTADO: Record<EstadoPedido, string> = {
  solicitado: 'info',
  aceptado: 'aviso',
  cancelado: 'apagado',
  pagado: 'info',
  entregado: 'aviso',
  en_disputa: 'peligro',
  liberado: 'exito',
  reembolsado: 'apagado',
  resuelto: 'exito',
};

export function EstadoPedidoBadge({ estado }: { estado: EstadoPedido }) {
  return <span className={`badge badge-${CLASE_ESTADO[estado]}`}>{ETIQUETA_ESTADO[estado]}</span>;
}

export function Direccion({ valor }: { valor: string }) {
  return (
    <span className="direccion" title={valor}>
      {valor.slice(0, 5)}…{valor.slice(-5)} <Copiar texto={valor} etiqueta="Copiar" />
    </span>
  );
}

export function Aviso({ tipo = 'info', children }: { tipo?: 'info' | 'aviso' | 'peligro' | 'exito'; children: ReactNode }) {
  return <div className={`caja caja-${tipo}`}>{children}</div>;
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return <p className="tenue cargando">{texto}</p>;
}

export function fechaCorta(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
}
