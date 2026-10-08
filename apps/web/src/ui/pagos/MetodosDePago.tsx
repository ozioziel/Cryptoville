import { NOMBRE_METODO, comisionDeMetodo, porcentajeBps, type MetodoPago, type Reputacion } from '@cryptoville/shared';
import { obtenerConfig, reglas } from '../../lib/config';
import { Icono, type NombreIcono } from '../components/Iconos';

const ICONO: Record<MetodoPago, NombreIcono> = { directo: 'rayo', garantia: 'escudo', etapas: 'fases' };

const TEXTO: Record<MetodoPago, string> = {
  directo: 'Pagas al proveedor en el momento. Sin garantía ni árbitro: si hay un problema solo puedes reportarlo.',
  garantia: 'El contrato guarda el dinero hasta que confirmas la entrega. Si hay un problema, decide un árbitro.',
  etapas: 'El trabajo se divide en fases: pagas cada fase cuando apruebas su prueba. Las fases se acuerdan antes de pagar.',
};

/** Métodos que ofrece este servidor (directo y por etapas necesitan el contrato v2). */
export function metodosDisponibles(): MetodoPago[] {
  return obtenerConfig().contrato_v2_id ? ['directo', 'garantia', 'etapas'] : ['garantia'];
}

/**
 * Las tres formas de pagar, como tarjetas una al lado de la otra (nombre, icono y comisión).
 * Debajo se explica el método elegido; si es el pago directo, con la alerta en ámbar y la reputación del proveedor.
 */
export function MetodosDePago({
  valor,
  onCambiar,
  reputacion,
  deshabilitado,
  noDisponibles,
}: {
  valor: MetodoPago;
  onCambiar: (m: MetodoPago) => void;
  reputacion?: Reputacion | null;
  deshabilitado?: boolean;
  /** Métodos que no se pueden elegir aquí, con el motivo (por ejemplo, «por etapas» en una propuesta sin plan). */
  noDisponibles?: Partial<Record<MetodoPago, string>>;
}) {
  const disponibles = metodosDisponibles();
  const r = reglas();
  return (
    <div className="pila-compacta">
      <div className="metodos" role="radiogroup" aria-label="Cómo quieres pagar">
        {(['directo', 'garantia', 'etapas'] as const).map((m) => {
          const activo = valor === m;
          const motivo = noDisponibles?.[m];
          const disponible = disponibles.includes(m) && !motivo;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={activo}
              disabled={deshabilitado || !disponible}
              title={disponible ? undefined : (motivo ?? 'Disponible cuando el servidor active el contrato v2')}
              className={`metodo metodo-${m} ${activo ? 'activo' : ''}`}
              onClick={() => onCambiar(m)}
            >
              <span className="metodo-icono">
                <Icono nombre={ICONO[m]} tamano={20} />
                {m === 'directo' && (
                  <span className="metodo-signo" aria-label="Sin protección">
                    <Icono nombre="alerta" tamano={13} />
                  </span>
                )}
              </span>
              <strong>{NOMBRE_METODO[m]}</strong>
              <span className="metodo-comision">{porcentajeBps(comisionDeMetodo(m, r))}</span>
            </button>
          );
        })}
      </div>
      <p className="metodo-texto">{TEXTO[valor]}</p>
      {Object.values(noDisponibles ?? {}).map((motivo) => (
        <p key={motivo} className="tenue pequeno">
          {motivo}
        </p>
      ))}
      {valor === 'directo' && (
        <p className="metodo-alerta" role="note">
          <Icono nombre="alerta" tamano={15} /> ¿Confías en esta persona? Si no entrega, nadie puede devolverte el dinero.
          {reputacion !== undefined && (
            <span className="metodo-reputacion">
              {reputacion
                ? `${reputacion.nivel} · ${reputacion.completados} ${reputacion.completados === 1 ? 'pedido' : 'pedidos'} · ${reputacion.calificacion === null ? 'sin reseñas' : `★ ${reputacion.calificacion.toFixed(1)}`}`
                : 'Nuevo · sin reseñas'}
            </span>
          )}
        </p>
      )}
      {disponibles.length === 1 && <p className="tenue pequeno">Pagar directo y por etapas estarán disponibles cuando el servidor active el contrato v2.</p>}
    </div>
  );
}
