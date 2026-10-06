import { ETIQUETA_ESTADO, aparienciaDeUsuario, type AparienciaPersona, type EstadoPedido } from '@cryptoville/shared';
import { useMemo, useState, type ReactNode } from 'react';
import { crearPersona } from '../../arte/persona';
import { Icono } from './Iconos';

/**
 * Personaje de la persona, dibujado en vectores.
 * Se usa igual que antes (`frame` = personaje de Kenney); si se pasa `apariencia`, manda la apariencia.
 */
export function Avatar({
  frame,
  apariencia,
  tamano = 32,
  titulo,
  recorte = 'cabeza',
}: {
  frame: number;
  apariencia?: AparienciaPersona | null;
  tamano?: number;
  titulo?: string;
  recorte?: 'cabeza' | 'cuerpo';
}) {
  const svg = useMemo(
    () => crearPersona(aparienciaDeUsuario({ avatar: frame, apariencia }), { recorte }),
    [frame, apariencia, recorte],
  );
  const alto = recorte === 'cuerpo' ? Math.round((tamano * 92) / 60) : tamano;
  return (
    <span
      className={`avatar avatar-${recorte}`}
      role="img"
      aria-label={titulo ?? 'Personaje'}
      title={titulo}
      style={{ width: tamano, height: alto }}
      // El SVG sale de crearPersona, que solo usa valores del catálogo (nunca texto de la base).
      dangerouslySetInnerHTML={{ __html: svg }}
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
      <Icono nombre="copiar" tamano={14} />
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
      <span className="estrellas-vacias">{'★'.repeat(5 - llenas)}</span> {valor.toFixed(1)}
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

/** Recuadro verde de la muestra: el pago queda en un contrato de Stellar. */
export function Garantia() {
  return (
    <div className="garantia">
      <Icono nombre="escudo" />
      <span>
        <b>Pago en garantía con Stellar.</b> El dinero queda en un contrato y se libera cuando confirmas la entrega.
      </span>
    </div>
  );
}

/** Día y mes ("16 oct."), para las fechas límite de los «Se busca». */
export function fechaDia(iso: string): string {
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' });
}

export function fechaCorta(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
}
