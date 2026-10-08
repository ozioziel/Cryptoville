import { NOMBRE_PRUEBA, TIPOS_PRUEBA, montosDeFases, unidadesAUsdc, usdcAUnidades, validarPlan, type PlanFase, type TipoPrueba } from '@cryptoville/shared';
import { useMemo } from 'react';
import { aIso, aLocal } from '../../features/pagos/datos';
import { reglas } from '../../lib/config';
import { Icono } from '../components/Iconos';

/** Plan de ejemplo para empezar: 30 / 30 / 40, una semana por fase. */
export function planInicial(dias = 7): PlanFase[] {
  const fecha = (n: number) => new Date(Date.now() + n * dias * 86_400_000).toISOString();
  return [
    { descripcion: 'Primera parte', porcentaje_proyecto: 30, porcentaje_pago: 30, fecha_limite: fecha(1), pruebas: ['archivo'] },
    { descripcion: 'Segunda parte', porcentaje_proyecto: 30, porcentaje_pago: 30, fecha_limite: fecha(2), pruebas: ['archivo'] },
    { descripcion: 'Entrega final', porcentaje_proyecto: 40, porcentaje_pago: 40, fecha_limite: fecha(3), pruebas: ['archivo'] },
  ];
}

function Barra({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  const ok = valor === 100;
  return (
    <div className="barra-suma">
      <span className="fila espaciada pequeno">
        <span>{etiqueta}</span>
        <strong className={ok ? 'texto-exito' : 'texto-aviso'}>{valor}%</strong>
      </span>
      <span className="barra-suma-fondo">
        <span className={`barra-suma-relleno ${ok ? 'ok' : valor > 100 ? 'pasa' : ''}`} style={{ width: `${Math.min(100, valor)}%` }} />
      </span>
    </div>
  );
}

/**
 * Plan de fases: una tabla con una fila por fase (qué incluye, % del proyecto, % del pago, fecha y pruebas),
 * con scroll dentro de su caja, y debajo dos barras que se llenan hasta 100%.
 * Sin `onCambiar` es de solo lectura (lo que ve el cliente para aceptarlo).
 */
export function EditorPlan({ plan, monto, onCambiar }: { plan: PlanFase[]; monto: string; onCambiar?: (p: PlanFase[]) => void }) {
  const r = reglas();
  const editable = Boolean(onCambiar);
  const sumaProyecto = plan.reduce((a, f) => a + (Number(f.porcentaje_proyecto) || 0), 0);
  const sumaPago = plan.reduce((a, f) => a + (Number(f.porcentaje_pago) || 0), 0);
  const montos = useMemo(() => {
    try {
      return montosDeFases(BigInt(usdcAUnidades(monto || '0')), plan.map((f) => Number(f.porcentaje_pago) || 0)).map((u) => unidadesAUsdc(u));
    } catch {
      return plan.map(() => '—');
    }
  }, [monto, plan]);
  const error = editable ? validarPlan(plan, r) : null;
  const cambiar = (i: number, cambio: Partial<PlanFase>) => onCambiar?.(plan.map((f, j) => (j === i ? { ...f, ...cambio } : f)));
  const alternarPrueba = (i: number, t: TipoPrueba) => {
    const actuales = plan[i].pruebas;
    cambiar(i, { pruebas: actuales.includes(t) ? actuales.filter((x) => x !== t) : [...actuales, t] });
  };

  return (
    <div className="pila">
      <div className="tabla-plan-caja">
        <table className="tabla-plan">
          <thead>
            <tr>
              <th>Fase</th>
              <th>Qué incluye</th>
              <th>% proyecto</th>
              <th>% pago</th>
              <th>Fecha límite</th>
              <th>Pruebas</th>
              {editable && <th aria-label="Quitar" />}
            </tr>
          </thead>
          <tbody>
            {plan.map((f, i) => (
              <tr key={i}>
                <td className="tabla-plan-numero">
                  {i + 1}
                  <span className="tenue pequeno">{montos[i]} USDC</span>
                </td>
                <td>
                  {editable ? (
                    <input className="campo" maxLength={300} value={f.descripcion} aria-label={`Qué incluye la fase ${i + 1}`} onChange={(e) => cambiar(i, { descripcion: e.target.value })} />
                  ) : (
                    f.descripcion
                  )}
                </td>
                <td>
                  {editable ? (
                    <input className="campo campo-corto" type="number" min={1} max={100} value={f.porcentaje_proyecto} aria-label={`Porcentaje del proyecto de la fase ${i + 1}`} onChange={(e) => cambiar(i, { porcentaje_proyecto: Number(e.target.value) })} />
                  ) : (
                    `${f.porcentaje_proyecto}%`
                  )}
                </td>
                <td>
                  {editable ? (
                    <input className="campo campo-corto" type="number" min={1} max={100} value={f.porcentaje_pago} aria-label={`Porcentaje del pago de la fase ${i + 1}`} onChange={(e) => cambiar(i, { porcentaje_pago: Number(e.target.value) })} />
                  ) : (
                    `${f.porcentaje_pago}%`
                  )}
                </td>
                <td>
                  {editable ? (
                    <input className="campo" type="datetime-local" value={aLocal(f.fecha_limite)} aria-label={`Fecha límite de la fase ${i + 1}`} onChange={(e) => e.target.value && cambiar(i, { fecha_limite: aIso(e.target.value) })} />
                  ) : (
                    new Date(f.fecha_limite).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })
                  )}
                </td>
                <td>
                  {editable ? (
                    <span className="opciones-pruebas">
                      {TIPOS_PRUEBA.map((t) => (
                        <label key={t} className="casilla casilla-fila pequeno">
                          <input type="checkbox" checked={f.pruebas.includes(t)} onChange={() => alternarPrueba(i, t)} />
                          {NOMBRE_PRUEBA[t]}
                        </label>
                      ))}
                    </span>
                  ) : f.pruebas.length ? (
                    f.pruebas.map((t) => NOMBRE_PRUEBA[t]).join(', ')
                  ) : (
                    'Cualquiera'
                  )}
                </td>
                {editable && (
                  <td>
                    <button
                      type="button"
                      className="boton-icono"
                      disabled={plan.length <= r.fases.min}
                      aria-label={`Quitar la fase ${i + 1}`}
                      onClick={() => onCambiar?.(plan.filter((_, j) => j !== i))}
                    >
                      <Icono nombre="cerrar" tamano={16} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && plan.length < r.fases.max && (
        <button
          type="button"
          className="boton boton-mini"
          onClick={() => {
            const ultima = plan.at(-1);
            const fecha = new Date((ultima ? Date.parse(ultima.fecha_limite) : Date.now()) + 7 * 86_400_000).toISOString();
            onCambiar?.([...plan, { descripcion: 'Nueva fase', porcentaje_proyecto: 10, porcentaje_pago: 10, fecha_limite: fecha, pruebas: ['archivo'] }]);
          }}
        >
          <Icono nombre="mas" tamano={14} /> Agregar fase
        </button>
      )}
      <Barra etiqueta="Proyecto" valor={sumaProyecto} />
      <Barra etiqueta="Pago" valor={sumaPago} />
      {error && <p className="texto-aviso pequeno">{error}</p>}
    </div>
  );
}
