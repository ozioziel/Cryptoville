import {
  ACCIONES_FASE,
  ETIQUETA_FASE,
  FASES_FINALES,
  NOMBRE_PRUEBA,
  pruebasQueFaltan,
  puedeHacerEnFase,
  vencioParaAccion,
  type AccionFase,
  type Fase,
  type MetodoPago,
  type PlanFase,
  type TipoPrueba,
} from '@cryptoville/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSesion } from '../../features/auth/sesion';
import { CanceladoPorUsuario } from '../../features/auth/wallet';
import { FirmarEnApp } from '../../features/escrow/FirmarEnApp';
import { cargarFases, cargarPruebas, type PruebaDeFase } from '../../features/pagos/datos';
import type { PedidoDetalle } from '../../features/orders/datos';
import { api, mensajeDeError } from '../../lib/api';
import { plazosV2, reglas } from '../../lib/config';
import { useEstado } from '../estado';
import { Aviso, Cargando, fechaCorta } from '../components/basicos';
import { Icono } from '../components/Iconos';
import { EditorPlan, planInicial } from './EditorPlan';
import { MetodosDePago } from './MetodosDePago';
import { PagarConQr } from './PagarConQr';
import { Pruebas } from './Pruebas';

type Rol = 'cliente' | 'proveedor' | 'arbitro';

const CLASE_FASE: Record<string, string> = {
  propuesta: 'apagado',
  en_curso: 'info',
  entregada: 'aviso',
  liberada: 'exito',
  reembolsada: 'apagado',
  en_disputa: 'peligro',
  resuelta: 'exito',
};

const aPlan = (fases: Fase[]): PlanFase[] =>
  fases.map((f) => ({
    descripcion: f.descripcion,
    porcentaje_proyecto: f.porcentaje_proyecto,
    porcentaje_pago: f.porcentaje_pago,
    fecha_limite: f.fecha_limite,
    pruebas: f.pruebas,
  }));

/** Pedidos del contrato v2 (con garantía, por etapas o pago directo): todo lo que pasa antes y después de pagar. */
export function PedidoV2({ pedido, rol, onListo }: { pedido: PedidoDetalle; rol: Rol; onListo: (texto: string) => void }) {
  const { usuario } = useSesion();
  const { version } = useEstado();
  const [fases, setFases] = useState<Fase[] | null>(null);
  const [pruebas, setPruebas] = useState<PruebaDeFase[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [f, p] = await Promise.all([cargarFases(pedido.id), cargarPruebas(pedido.id)]);
      setFases(f);
      setPruebas(p);
    } catch (e) {
      setError(mensajeDeError(e));
    }
  }, [pedido.id]);
  useEffect(() => {
    void cargar();
  }, [cargar, version, pedido.estado]);

  if (error) return <Aviso tipo="peligro">{error}</Aviso>;
  if (!fases || !usuario) return <Cargando />;
  const metodo = (pedido.metodo_pago ?? 'garantia') as MetodoPago;
  const listo = async (texto: string) => {
    await cargar();
    onListo(texto);
  };

  if (pedido.estado === 'solicitado') {
    return <AntesDeAceptar pedido={pedido} rol={rol} metodo={metodo} onListo={listo} />;
  }
  if (metodo === 'directo') return <PagoDirecto pedido={pedido} rol={rol} onListo={listo} />;
  if (pedido.estado === 'aceptado') return <AntesDePagar pedido={pedido} rol={rol} metodo={metodo} fases={fases} onListo={listo} />;
  return <ConFases pedido={pedido} rol={rol} fases={fases} pruebas={pruebas} usuarioId={usuario.id} onListo={listo} />;
}

// ---------------------------------------------------------------
// Antes de que el proveedor acepte
// ---------------------------------------------------------------

function AntesDeAceptar({ pedido, rol, metodo, onListo }: { pedido: PedidoDetalle; rol: Rol; metodo: MetodoPago; onListo: (t: string) => void }) {
  const [plan, setPlan] = useState<PlanFase[]>(() => planInicial());
  const [monto, setMonto] = useState(pedido.monto_usdc);
  const [error, setError] = useState<string | null>(null);
  if (rol === 'cliente') {
    return (
      <div className="pila">
        <p className="tenue pequeno">Esperando que el proveedor acepte. Hasta entonces puedes cambiar cómo pagar:</p>
        <MetodosDePago
          valor={metodo}
          onCambiar={async (m) => {
            try {
              await api(`/pedidos/${pedido.id}/metodo`, { cuerpo: { metodo_pago: m } });
              onListo('Cambiaste el método de pago');
            } catch (e) {
              setError(mensajeDeError(e));
            }
          }}
        />
        {error && <Aviso tipo="peligro">{error}</Aviso>}
      </div>
    );
  }
  if (rol !== 'proveedor' || metodo !== 'etapas') return null;
  return (
    <div className="pila">
      <p>
        El cliente quiere pagar <strong>por etapas</strong>. Arma el plan: qué incluye cada fase, qué porcentaje del proyecto y del pago es, su
        fecha y qué prueba vas a subir. El cliente lo acepta antes de pagar.
      </p>
      <label className="etiqueta">
        Precio total (USDC)
        <input className="campo" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} />
      </label>
      <EditorPlan plan={plan} monto={monto} onCambiar={setPlan} />
      <button
        type="button"
        className="boton boton-primario"
        onClick={async () => {
          setError(null);
          try {
            await api(`/pedidos/${pedido.id}/plan`, { cuerpo: { fases: plan, monto_usdc: monto } });
            onListo('Mandaste el plan al cliente');
          } catch (e) {
            setError(mensajeDeError(e));
          }
        }}
      >
        Aceptar con este plan
      </button>
      {error && <Aviso tipo="peligro">{error}</Aviso>}
    </div>
  );
}

// ---------------------------------------------------------------
// Aceptado: el plan (por etapas) y el pago en garantía
// ---------------------------------------------------------------

function AntesDePagar({ pedido, rol, metodo, fases, onListo }: { pedido: PedidoDetalle; rol: Rol; metodo: MetodoPago; fases: Fase[]; onListo: (t: string) => void }) {
  const [plan, setPlan] = useState<PlanFase[]>(() => aPlan(fases));
  const [comentario, setComentario] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setPlan(aPlan(fases)), [fases]);
  const pendiente = metodo === 'etapas' && !pedido.plan_aceptado_en;
  const accion = async (ruta: string, cuerpo: unknown, texto: string) => {
    setError(null);
    try {
      await api(ruta, { cuerpo });
      onListo(texto);
    } catch (e) {
      setError(mensajeDeError(e));
    }
  };

  return (
    <div className="pila">
      {pedido.plan_comentario && pendiente && (
        <Aviso tipo="aviso">
          <strong>El cliente pidió cambios:</strong> {pedido.plan_comentario}
        </Aviso>
      )}
      {metodo === 'etapas' && <h4>Plan de fases</h4>}
      <EditorPlan plan={plan} monto={pedido.monto_usdc} onCambiar={pendiente && rol === 'proveedor' ? setPlan : undefined} />
      {pendiente && rol === 'proveedor' && (
        <button type="button" className="boton" onClick={() => accion(`/pedidos/${pedido.id}/plan`, { fases: plan }, 'Mandaste el plan corregido')}>
          Enviar el plan corregido
        </button>
      )}
      {pendiente && rol === 'cliente' && (
        <>
          <button type="button" className="boton boton-primario" onClick={() => accion(`/pedidos/${pedido.id}/plan/aceptar`, {}, 'Aceptaste el plan')}>
            Aceptar el plan
          </button>
          <details className="caja">
            <summary>Pedir cambios al plan</summary>
            <textarea className="campo" rows={2} maxLength={500} placeholder="¿Qué cambiarías?" value={comentario} onChange={(e) => setComentario(e.target.value)} />
            <button
              type="button"
              className="boton"
              disabled={comentario.trim().length < 5}
              onClick={() => accion(`/pedidos/${pedido.id}/plan/cambios`, { comentario }, 'Le pediste cambios al proveedor')}
            >
              Enviar
            </button>
          </details>
        </>
      )}
      {pendiente && rol === 'proveedor' && !pedido.plan_comentario && <p className="tenue pequeno">Esperando que el cliente acepte el plan.</p>}
      {!pendiente && rol === 'cliente' && (
        <div className="paso-lab">
          <p>
            Pagas <strong>{pedido.monto_usdc} USDC</strong> de una vez. El contrato los guarda y suelta {fases.length > 1 ? 'cada fase' : 'el pago'} cuando apruebas
            la prueba del proveedor.
          </p>
          <FirmarEnApp
            pedidoId={pedido.id}
            tipo="paso_v2"
            accion="crear_pedido"
            etiqueta="Pago en garantía"
            texto={`Pagar ${pedido.monto_usdc} USDC en garantía`}
            extra={{}}
            onListo={() => onListo('Pagaste en garantía')}
          />
          <PagarConQr montoUsdc={pedido.monto_usdc} pedidoId={pedido.id} />
        </div>
      )}
      {!pendiente && rol === 'proveedor' && <p className="tenue">Esperando el pago en garantía del cliente.</p>}
      {error && <Aviso tipo="peligro">{error}</Aviso>}
    </div>
  );
}

// ---------------------------------------------------------------
// Pago directo
// ---------------------------------------------------------------

function PagoDirecto({ pedido, rol, onListo }: { pedido: PedidoDetalle; rol: Rol; onListo: (t: string) => void }) {
  const { walletParaFirmar } = useSesion();
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hacer = async (ruta: string, texto: string) => {
    setError(null);
    try {
      await api(ruta, { cuerpo: {} });
      onListo(texto);
    } catch (e) {
      setError(mensajeDeError(e));
    }
  };

  /** QR SEP-7 con la transacción ya armada: la wallet del celular la firma y la envía; la app la detecta sola. */
  const mostrarQr = async () => {
    setError(null);
    try {
      const direccion = await walletParaFirmar();
      const p = await api<{ xdr: string; passphrase: string }>('/transacciones/preparar', {
        cuerpo: { tipo: 'pago_directo', pedido_id: pedido.id, accion: 'pagar_directo', direccion },
      });
      const QR = await import('qrcode');
      const uri = `web+stellar:tx?xdr=${encodeURIComponent(p.xdr)}&network_passphrase=${encodeURIComponent(p.passphrase)}`;
      setQr(await QR.toString(uri, { type: 'svg', errorCorrectionLevel: 'L', margin: 1 }));
    } catch (e) {
      if (!(e instanceof CanceladoPorUsuario)) setError(mensajeDeError(e));
    }
  };

  return (
    <div className="pila">
      {pedido.estado === 'aceptado' && rol === 'cliente' && (
        <div className="paso-lab metodo-directo-aviso">
          <p className="metodo-alerta">
            <Icono nombre="alerta" tamano={15} /> Pago directo: el dinero va al proveedor en el momento. Si no entrega, nadie puede devolverlo.
          </p>
          <FirmarEnApp
            pedidoId={pedido.id}
            tipo="pago_directo"
            accion="pagar_directo"
            etiqueta="Pago directo"
            texto={`Pagar ${pedido.monto_usdc} USDC directo`}
            extra={{}}
            onListo={() => onListo('Pagaste directo')}
          />
          <PagarConQr montoUsdc={pedido.monto_usdc} pedidoId={pedido.id} />
          <button type="button" className="boton boton-chico" onClick={mostrarQr}>
            <Icono nombre="qr" /> Pagar con el celular (QR)
          </button>
          {qr && (
            <div className="qr-pago pila-compacta">
              <span className="qr-imagen" role="img" aria-label="Código QR del pago" dangerouslySetInnerHTML={{ __html: qr }} />
              <span className="tenue pequeno">Escanéalo con una wallet compatible con SEP-7. Cuando la red lo confirme, el pedido se actualiza solo (en un minuto).</span>
            </div>
          )}
        </div>
      )}
      {pedido.estado === 'aceptado' && rol === 'proveedor' && <p className="tenue">Esperando el pago directo del cliente.</p>}
      {pedido.estado === 'pagado' && rol === 'proveedor' && (
        <button type="button" className="boton boton-primario" onClick={() => hacer(`/pedidos/${pedido.id}/directo/entregado`, 'Marcaste el pedido como entregado')}>
          Marcar como entregado
        </button>
      )}
      {(pedido.estado === 'pagado' || pedido.estado === 'entregado') && rol === 'cliente' && (
        <>
          <button type="button" className="boton boton-primario" onClick={() => hacer(`/pedidos/${pedido.id}/directo/recibido`, 'Confirmaste que recibiste el trabajo')}>
            Confirmar que lo recibí
          </button>
          <p className="tenue pequeno">
            Fue un pago directo: no hay disputa. Si algo salió mal, reporta a la persona desde su local. Si no confirmas, el pedido se da por
            terminado cuando venza el plazo de revisión.
          </p>
        </>
      )}
      {error && <Aviso tipo="peligro">{error}</Aviso>}
    </div>
  );
}

// ---------------------------------------------------------------
// Pagado: el camino de fases y el detalle de cada fase
// ---------------------------------------------------------------

/** Camino horizontal: un punto por fase, con el color de su estado. Se desliza de lado si hay muchas. */
function CaminoFases({ fases, actual, onElegir }: { fases: Fase[]; actual: number; onElegir: (n: number) => void }) {
  return (
    <ol className="camino-fases" aria-label="Fases del pedido">
      {fases.map((f) => (
        <li key={f.id} className={`camino-paso camino-${f.estado} ${f.numero === actual ? 'elegido' : ''}`}>
          <button type="button" onClick={() => onElegir(f.numero)} aria-current={f.numero === actual ? 'step' : undefined}>
            <span className="camino-punto">{FASES_FINALES.includes(f.estado) ? <Icono nombre="escudo" tamano={14} /> : f.numero + 1}</span>
            <span className="camino-texto">
              <strong>Fase {f.numero + 1}</strong>
              <span>{f.porcentaje_pago}% · {ETIQUETA_FASE[f.estado]}</span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function ConFases({ pedido, rol, fases, pruebas, usuarioId, onListo }: { pedido: PedidoDetalle; rol: Rol; fases: Fase[]; pruebas: PruebaDeFase[]; usuarioId: string; onListo: (t: string) => void }) {
  const actual = useMemo(() => fases.find((f) => !FASES_FINALES.includes(f.estado))?.numero ?? fases.length - 1, [fases]);
  const [elegida, setElegida] = useState(actual);
  useEffect(() => setElegida(actual), [actual]);
  const fase = fases[elegida];
  const { avisar } = useEstado();
  return (
    <div className="pila">
      <CaminoFases fases={fases} actual={elegida} onElegir={setElegida} />
      {fase && <DetalleFase pedido={pedido} rol={rol} fases={fases} fase={fase} pruebas={pruebas.filter((p) => p.fase === fase.numero)} usuarioId={usuarioId} onListo={onListo} />}
      <button
        type="button"
        className="enlace"
        onClick={async () => {
          try {
            await api(`/pedidos/${pedido.id}/sincronizar`, { cuerpo: {} });
            onListo('Pedido actualizado desde la red');
          } catch (e) {
            avisar(mensajeDeError(e), 'error');
          }
        }}
      >
        Actualizar desde la red
      </button>
    </div>
  );
}

function DetalleFase({
  pedido,
  rol,
  fases,
  fase,
  pruebas,
  usuarioId,
  onListo,
}: {
  pedido: PedidoDetalle;
  rol: Rol;
  fases: Fase[];
  fase: Fase;
  pruebas: PruebaDeFase[];
  usuarioId: string;
  onListo: (t: string) => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [decision, setDecision] = useState('');
  const [resultado, setResultado] = useState<'Cliente' | 'Proveedor' | 'Mitad'>('Cliente');
  const plazos = plazosV2();
  const estados = fases.map((f) => ({ estado: f.estado }));
  const entregaActual = pruebas.filter((p) => p.para === 'entrega' && p.entrega === fase.cambios + 1);
  const faltan = pruebasQueFaltan(fase.pruebas, entregaActual.map((p) => ({ tipo: p.tipo as TipoPrueba })));
  const acciones = (Object.keys(ACCIONES_FASE) as AccionFase[]).filter(
    (a) =>
      puedeHacerEnFase(a, estados, fase.numero, rol) &&
      (ACCIONES_FASE[a].actor !== 'cualquiera' || vencioParaAccion(a, fase, plazos)),
  );
  const finRevision = fase.entregada_en ? new Date(Date.parse(fase.entregada_en) + plazos.revisionSeg * 1000) : null;

  return (
    <section className="caja pila" aria-label={`Fase ${fase.numero + 1}`}>
      <span className="fila espaciada">
        <strong>
          Fase {fase.numero + 1}: {fase.descripcion}
        </strong>
        <span className={`badge badge-${CLASE_FASE[fase.estado]}`}>{ETIQUETA_FASE[fase.estado]}</span>
      </span>
      <dl className="datos">
        <dt>Monto</dt>
        <dd className="precio">{fase.monto_usdc} USDC</dd>
        <dt>Parte</dt>
        <dd>
          {fase.porcentaje_proyecto}% del proyecto · {fase.porcentaje_pago}% del pago
        </dd>
        <dt>Fecha límite</dt>
        <dd>{fechaCorta(fase.fecha_limite)}</dd>
        <dt>Pruebas pactadas</dt>
        <dd>{fase.pruebas.length ? fase.pruebas.map((t) => NOMBRE_PRUEBA[t]).join(', ') : 'Cualquier prueba'}</dd>
        {fase.cambios > 0 && (
          <>
            <dt>Cambios pedidos</dt>
            <dd>
              {fase.cambios} de {reglas().fases.cambiosPorFase}
            </dd>
          </>
        )}
        {fase.huella && (
          <>
            <dt>Huella en el contrato</dt>
            <dd className="huella" title={fase.huella}>
              {fase.huella.slice(0, 16)}…
            </dd>
          </>
        )}
      </dl>
      {fase.estado === 'entregada' && finRevision && (
        <Aviso tipo="aviso">
          {rol === 'cliente' ? 'Revisa la entrega' : 'El cliente está revisando'}: tiene hasta el {fechaCorta(finRevision.toISOString())}. Si no responde, el proveedor cobra esta fase.
        </Aviso>
      )}

      <h4>Pruebas de la entrega</h4>
      <Pruebas
        pedidoId={pedido.id}
        fase={fase.numero}
        pruebas={pruebas}
        para="entrega"
        usuarioId={usuarioId}
        puedeSubir={rol === 'proveedor' && fase.estado === 'en_curso'}
        onCambio={() => onListo('Pruebas actualizadas')}
      />

      {acciones.map((a) => {
        const def = ACCIONES_FASE[a];
        const extra =
          a === 'abrir_disputa' ? { fase: fase.numero, motivo } : a === 'resolver' ? { fase: fase.numero, resultado, decision } : { fase: fase.numero };
        const deshabilitado = (a === 'abrir_disputa' && motivo.trim().length < 10) || (a === 'resolver' && decision.trim().length < 10) || (a === 'entregar_fase' && faltan.length > 0);
        return (
          <div key={a} className={`paso-lab ${a === 'abrir_disputa' ? 'paso-secundario' : ''}`}>
            <strong>{def.etiqueta}</strong>
            <p className="pequeno">{def.ayuda}</p>
            {a === 'entregar_fase' && faltan.length > 0 && (
              <p className="texto-aviso pequeno">Falta subir: {faltan.map((t) => NOMBRE_PRUEBA[t]).join(', ')}.</p>
            )}
            {a === 'abrir_disputa' && (
              <textarea className="campo" rows={2} maxLength={1000} placeholder="Motivo de la disputa (lo lee el árbitro)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            )}
            {a === 'resolver' && (
              <>
                <div className="pestanas" role="radiogroup" aria-label="Resultado">
                  {(['Cliente', 'Proveedor', 'Mitad'] as const).map((r) => (
                    <button key={r} type="button" role="radio" aria-checked={r === resultado} className={r === resultado ? 'activa' : ''} onClick={() => setResultado(r)}>
                      {r === 'Mitad' ? '50/50' : `A favor del ${r === 'Cliente' ? 'cliente' : 'proveedor'}`}
                    </button>
                  ))}
                </div>
                <textarea className="campo" rows={2} maxLength={1000} placeholder="Explicación de la decisión (la ven las dos partes)" value={decision} onChange={(e) => setDecision(e.target.value)} />
              </>
            )}
            <FirmarEnApp pedidoId={pedido.id} tipo="paso_v2" accion={a} etiqueta={def.etiqueta} extra={extra} deshabilitado={deshabilitado} onListo={() => onListo(def.etiqueta)} />
          </div>
        );
      })}

      {(fase.estado === 'en_disputa' || fase.estado === 'resuelta' || fase.motivo_disputa) && (
        <section className="pila-compacta">
          <h4>Disputa de esta fase</h4>
          {fase.motivo_disputa && (
            <p className="cita">
              <strong>Motivo:</strong> {fase.motivo_disputa}
            </p>
          )}
          {fase.ganador && (
            <Aviso tipo="exito">
              <strong>Decisión ({fase.ganador === 'Mitad' ? '50/50' : `a favor del ${fase.ganador === 'Cliente' ? 'cliente' : 'proveedor'}`}):</strong> {fase.decision}
            </Aviso>
          )}
          <Pruebas
            pedidoId={pedido.id}
            fase={fase.numero}
            pruebas={pruebas}
            para="disputa"
            usuarioId={usuarioId}
            puedeSubir={(rol === 'cliente' || rol === 'proveedor') && fase.estado === 'en_disputa'}
            onCambio={() => onListo('Pruebas actualizadas')}
          />
        </section>
      )}
    </section>
  );
}
