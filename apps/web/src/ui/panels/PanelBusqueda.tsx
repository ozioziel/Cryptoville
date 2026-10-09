import {
  BARRIOS,
  ETIQUETA_ESTADO_PROPUESTA,
  aceptaPropuestas,
  diasHasta,
  type EstadoPropuesta,
  type MetodoPago,
  type PlanFase,
  type Reputacion,
} from '@cryptoville/shared';
import { useCallback, useEffect, useState } from 'react';
import { useSesion } from '../../features/auth/sesion';
import { cargarBusqueda, type BusquedaDetalle, type PropuestaDetalle } from '../../features/busquedas/datos';
import { cargarReputaciones } from '../../features/services/datos';
import { cargarPortafolio, cargarProyectos } from '../../features/portafolio/datos';
import { TarjetaProyecto } from './PanelPortafolio';
import type { Proyecto } from '@cryptoville/shared';
import { api, mensajeDeError } from '../../lib/api';
import { obtenerConfig } from '../../lib/config';
import { EditorPlan, planInicial } from '../pagos/EditorPlan';
import { MetodosDePago } from '../pagos/MetodosDePago';
import { useEstado } from '../estado';
import { Aviso, Avatar, Cargando, Estrellas, Garantia, fechaCorta } from '../components/basicos';
import { CartelSeBusca } from '../components/Cartel';
import { Icono } from '../components/Iconos';
import { BotonBloquear, BotonReportar, Nombre } from '../components/Confianza';

/** «Luego pagas en garantía», «luego pagas por etapas»… */
const COMO_PAGA: Record<MetodoPago, string> = { directo: 'directo', garantia: 'en garantía', etapas: 'por etapas' };

const CLASE_PROPUESTA: Record<EstadoPropuesta, string> = {
  enviada: 'info',
  aceptada: 'exito',
  rechazada: 'apagado',
  retirada: 'apagado',
};

/** Un «Se busca»: lo que necesita la persona y, según quién mira, las propuestas o el formulario para proponer. */
export function PanelBusqueda({ id }: { id: string }) {
  const { usuario, locales: misLocales } = useSesion();
  const { abrir, cambiar, version, refrescar, notificar, irAlSeBusca, modo, cerrar } = useEstado();
  const [b, setB] = useState<BusquedaDetalle | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setB(await cargarBusqueda(id));
    } catch (e) {
      setError(mensajeDeError(e));
    }
  }, [id]);
  useEffect(() => {
    void cargar();
  }, [cargar, version, usuario]);

  if (error) return <Aviso tipo="peligro">{error}</Aviso>;
  if (b === undefined) return <Cargando />;
  if (b === null) return <Aviso tipo="peligro">Este «Se busca» ya no existe.</Aviso>;

  const esAutor = usuario?.id === b.autor_id;
  const abierta = aceptaPropuestas(b);
  const mia = b.propuestas.find((p) => p.proveedor_id === usuario?.id);
  const listo = async (texto: string) => {
    notificar(texto, null, b.id);
    refrescar();
    await cargar();
  };

  return (
    <div className="pila">
      <CartelSeBusca busqueda={b} />
      <section className="pila">
        <h3>Lo que necesita</h3>
        <p className="texto-largo">{b.descripcion}</p>
        <p className="tenue pequeno">
          Villa {BARRIOS[b.barrio].nombre} · publicado el {fechaCorta(b.creado_en)} por <Nombre nombre={b.autor.nombre} verificado={b.autor.verificado} />
        </p>
        {esAutor && abierta && modo !== 'trabajar' && (
          <p className="tenue pequeno">
            Tu «Se busca» aparece como un cartel en el modo «Quiero trabajar», donde lo ven los proveedores.{' '}
            <button
              type="button"
              className="enlace"
              onClick={() => {
                cerrar();
                irAlSeBusca(b);
              }}
            >
              Ver mi cartel
            </button>
          </p>
        )}
        {!esAutor && (
          <div className="fila">
            <BotonReportar tipo="busqueda" objetoId={b.id} nombre={'«' + b.titulo + '»'} />
            <BotonBloquear usuarioId={b.autor_id} nombre={b.autor.nombre} />
          </div>
        )}
      </section>

      {b.pedido_id && (esAutor || mia?.estado === 'aceptada') && (
        <button type="button" className="boton boton-primario" onClick={() => abrir({ tipo: 'pedido', id: b.pedido_id! })}>
          Ver el pedido
        </button>
      )}

      {esAutor ? (
        <PropuestasRecibidas
          busqueda={b}
          abierta={abierta}
          onElegida={(pedidoId) => {
            // El aviso "Elegiste la propuesta…" llega en vivo desde la API; aquí solo se abre el pedido.
            refrescar();
            cambiar({ tipo: 'pedido', id: pedidoId });
          }}
          onCerrada={() => listo('Cerraste tu «Se busca»')}
        />
      ) : !usuario ? (
        <>
          <p className="tenue">Entra para mandar una propuesta.</p>
          <button type="button" className="boton boton-primario" onClick={() => abrir({ tipo: 'bienvenida' })}>
            Entrar
          </button>
        </>
      ) : mia && mia.estado !== 'retirada' ? (
        <MiPropuesta busquedaId={b.id} propuesta={mia} abierta={abierta} onListo={listo} />
      ) : !abierta ? (
        <p className="tenue">Este «Se busca» ya no recibe propuestas.</p>
      ) : misLocales.some((l) => l.activo) ? (
        <FormularioPropuesta
          busquedaId={b.id}
          inicial={{
            monto: mia?.monto_usdc ?? b.presupuesto_usdc,
            dias: mia?.dias_entrega ?? diasHasta(b.fecha_limite),
            mensaje: mia?.mensaje ?? '',
            localId: mia?.local_id ?? null,
            plan: mia?.plan ?? null,
            proyectos: mia?.proyectos ?? [],
          }}
          textoBoton={mia ? 'Volver a mandar mi propuesta' : 'Mandar propuesta'}
          onListo={() => listo('Propuesta enviada')}
        />
      ) : (
        <Aviso tipo="aviso">
          <p>Para mandar una propuesta, primero abre tu local: así quien publicó puede visitarlo y ver tu reputación.</p>
          <button type="button" className="boton" onClick={() => abrir({ tipo: 'mi-local' })}>
            Abrir mi local
          </button>
        </Aviso>
      )}
      <Garantia />
    </div>
  );
}

function PropuestasRecibidas({
  busqueda: b,
  abierta,
  onElegida,
  onCerrada,
}: {
  busqueda: BusquedaDetalle;
  abierta: boolean;
  onElegida: (pedidoId: string) => void;
  onCerrada: () => void;
}) {
  const { cerrar, irAlLocal } = useEstado();
  const visibles = b.propuestas.filter((p) => p.estado !== 'retirada');
  const [reputaciones, setReputaciones] = useState<Map<string, Reputacion>>(new Map());
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [cerrando, setCerrando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = visibles.map((p) => p.proveedor_id).join(',');

  useEffect(() => {
    if (ids) void cargarReputaciones(ids.split(',')).then(setReputaciones);
  }, [ids]);

  const [metodo, setMetodo] = useState<MetodoPago>('garantia');

  const elegir = async (p: PropuestaDetalle) => {
    setError(null);
    setOcupado(true);
    try {
      const r = await api<{ pedido: { id: string } }>(`/propuestas/${p.id}/aceptar`, { cuerpo: { metodo_pago: metodo } });
      onElegida(r.pedido.id);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section className="pila">
      <h3>Propuestas ({visibles.length})</h3>
      {visibles.length === 0 && (
        <p className="tenue">{abierta ? 'Todavía no llegan propuestas. Te avisamos en la campana cuando lleguen.' : 'No hubo propuestas.'}</p>
      )}
      <ul className="lista-tarjetas">
        {visibles.map((p) => {
          const rep = reputaciones.get(p.proveedor_id);
          const local = p.local;
          return (
            <li key={p.id} className="tarjeta propuesta">
              <span className="fila espaciada">
                <span className="fila">
                  <Avatar frame={p.proveedor.avatar} apariencia={p.proveedor.apariencia} tamano={36} titulo={p.proveedor.nombre} />
                  <span className="pila-compacta">
                    <Nombre nombre={p.proveedor.nombre} verificado={p.proveedor.verificado} fuerte />
                    <span className="tenue pequeno">{local ? `${local.nombre} · Villa ${BARRIOS[local.barrio].nombre}` : 'Sin local'}</span>
                  </span>
                </span>
                <span className={`badge badge-${CLASE_PROPUESTA[p.estado]}`}>{ETIQUETA_ESTADO_PROPUESTA[p.estado]}</span>
              </span>
              <span className="fila pequeno">
                <Estrellas valor={rep?.calificacion ?? null} total={rep?.total_resenas} />
                <span className="tenue">· {rep?.nivel ?? 'Nuevo'}</span>
              </span>
              <span className="fila espaciada">
                <span className="precio">{p.monto_usdc} USDC</span>
                <span className="tenue pequeno">Entrega en {p.dias_entrega} {p.dias_entrega === 1 ? 'día' : 'días'}</span>
              </span>
              <p className="texto-largo">{p.mensaje}</p>
              {p.plan && p.plan.length > 0 && (
                <details>
                  <summary className="pequeno">
                    Trae un plan de {p.plan.length} {p.plan.length === 1 ? 'fase' : 'fases'}
                  </summary>
                  <EditorPlan plan={p.plan} monto={p.monto_usdc} />
                </details>
              )}
              {p.proyectos?.length > 0 && <ProyectosAdjuntos ids={p.proyectos} />}
              <span className="fila">
                {local?.activo && (
                  <button
                    type="button"
                    className="boton boton-mini"
                    onClick={() => {
                      cerrar();
                      irAlLocal(local);
                    }}
                  >
                    Ver su local <Icono nombre="flecha" tamano={14} />
                  </button>
                )}
                {abierta && p.estado === 'enviada' && confirmando !== p.id && (
                  <button
                    type="button"
                    className="boton boton-mini boton-elegir"
                    onClick={() => {
                      setMetodo(p.plan?.length && obtenerConfig().contrato_v2_id ? 'etapas' : 'garantia');
                      setConfirmando(p.id);
                    }}
                  >
                    Elegir esta propuesta
                  </button>
                )}
              </span>
              {confirmando === p.id && (
                <div className="caja caja-exito pila">
                  <span className="pequeno">
                    ¿Elegir a <b>{p.proveedor.nombre}</b> por <b>{p.monto_usdc} USDC</b>? Se crea el pedido y luego pagas {COMO_PAGA[metodo]}. Las demás
                    propuestas quedan sin elegir.
                  </span>
                  <span className="etiqueta">¿Cómo quieres pagar?</span>
                  <MetodosDePago
                    valor={metodo}
                    onCambiar={setMetodo}
                    reputacion={rep ?? null}
                    noDisponibles={p.plan?.length ? undefined : { etapas: 'Para pagar por etapas, la propuesta tiene que traer un plan de fases.' }}
                  />
                  {metodo === 'etapas' && <span className="tenue pequeno">Al elegirla aceptas su plan de fases tal como está arriba.</span>}
                  <span className="fila">
                    <button type="button" className="boton boton-primario" disabled={ocupado} onClick={() => elegir(p)}>
                      {ocupado ? 'Creando el pedido…' : 'Sí, elegir'}
                    </button>
                    <button type="button" className="boton" onClick={() => setConfirmando(null)}>
                      Cancelar
                    </button>
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {abierta &&
        (cerrando ? (
          <div className="caja caja-peligro pila">
            <span className="pequeno">¿Cerrar este «Se busca» sin elegir a nadie? Ya no recibirá propuestas.</span>
            <span className="fila">
              <button
                type="button"
                className="boton boton-peligro"
                disabled={ocupado}
                onClick={async () => {
                  setError(null);
                  setOcupado(true);
                  try {
                    await api(`/busquedas/${b.id}/cerrar`, { cuerpo: {} });
                    setCerrando(false);
                    onCerrada();
                  } catch (e) {
                    setError(mensajeDeError(e));
                  } finally {
                    setOcupado(false);
                  }
                }}
              >
                Sí, cerrarlo
              </button>
              <button type="button" className="boton" onClick={() => setCerrando(false)}>
                Cancelar
              </button>
            </span>
          </div>
        ) : (
          <button type="button" className="boton boton-peligro" onClick={() => setCerrando(true)}>
            Cerrar este «Se busca»
          </button>
        ))}
      {error && <Aviso tipo="peligro">{error}</Aviso>}
    </section>
  );
}

function MiPropuesta({
  busquedaId,
  propuesta: p,
  abierta,
  onListo,
}: {
  busquedaId: string;
  propuesta: PropuestaDetalle;
  abierta: boolean;
  onListo: (texto: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (editando) {
    return (
      <FormularioPropuesta
        busquedaId={busquedaId}
        inicial={{ monto: p.monto_usdc, dias: p.dias_entrega, mensaje: p.mensaje, localId: p.local_id, plan: p.plan, proyectos: p.proyectos ?? [] }}
        textoBoton="Guardar cambios"
        onListo={() => {
          setEditando(false);
          onListo('Propuesta actualizada');
        }}
        onCancelar={() => setEditando(false)}
      />
    );
  }
  return (
    <section className="pila">
      <h3>Tu propuesta</h3>
      <div className="tarjeta propuesta">
        <span className="fila espaciada">
          <span className="precio">{p.monto_usdc} USDC</span>
          <span className={`badge badge-${CLASE_PROPUESTA[p.estado]}`}>{ETIQUETA_ESTADO_PROPUESTA[p.estado]}</span>
        </span>
        <span className="tenue pequeno">
          Entrega en {p.dias_entrega} {p.dias_entrega === 1 ? 'día' : 'días'}
          {p.local && ` · desde ${p.local.nombre}`}
        </span>
        <p className="texto-largo">{p.mensaje}</p>
        {p.plan && p.plan.length > 0 && (
          <details>
            <summary className="pequeno">Tu plan de {p.plan.length} {p.plan.length === 1 ? 'fase' : 'fases'}</summary>
            <EditorPlan plan={p.plan} monto={p.monto_usdc} />
          </details>
        )}
      </div>
      {p.estado === 'aceptada' && <Aviso tipo="exito">¡Te eligieron! Cuando paguen, te avisamos para que empieces.</Aviso>}
      {p.estado === 'rechazada' && <p className="tenue pequeno">Esta vez eligieron otra propuesta o cerraron el «Se busca».</p>}
      {abierta && p.estado === 'enviada' && (
        <span className="fila">
          <button type="button" className="boton" onClick={() => setEditando(true)}>
            <Icono nombre="editar" tamano={16} /> Editar
          </button>
          <button
            type="button"
            className="boton boton-peligro"
            onClick={async () => {
              setError(null);
              try {
                await api(`/propuestas/${p.id}/retirar`, { cuerpo: {} });
                onListo('Retiraste tu propuesta');
              } catch (e) {
                setError(mensajeDeError(e));
              }
            }}
          >
            Retirar
          </button>
        </span>
      )}
      {error && <Aviso tipo="peligro">{error}</Aviso>}
    </section>
  );
}

function FormularioPropuesta({
  busquedaId,
  inicial,
  textoBoton,
  onListo,
  onCancelar,
}: {
  busquedaId: string;
  inicial: { monto: string; dias: number; mensaje: string; localId: string | null; plan: PlanFase[] | null; proyectos: string[] };
  textoBoton: string;
  onListo: () => void;
  onCancelar?: () => void;
}) {
  const { locales: misLocales } = useSesion();
  const abiertos = misLocales.filter((l) => l.activo);
  const [monto, setMonto] = useState(inicial.monto);
  const [dias, setDias] = useState(inicial.dias);
  const [mensaje, setMensaje] = useState(inicial.mensaje);
  const [localId, setLocalId] = useState(inicial.localId && abiertos.some((l) => l.id === inicial.localId) ? inicial.localId : (abiertos[0]?.id ?? ''));
  // El plan por fases solo existe con el contrato v2 (si no, se paga de una vez).
  const conFases = Boolean(obtenerConfig().contrato_v2_id);
  const [plan, setPlan] = useState<PlanFase[] | null>(conFases ? inicial.plan : null);
  const { usuario } = useSesion();
  const [misProyectos, setMisProyectos] = useState<Proyecto[]>([]);
  const [adjuntos, setAdjuntos] = useState<string[]>(inicial.proyectos);
  useEffect(() => {
    if (usuario) void cargarPortafolio(usuario.id).then((x) => setMisProyectos(x.proyectos), () => undefined);
  }, [usuario]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enviar = async () => {
    setError(null);
    setEnviando(true);
    try {
      await api(`/busquedas/${busquedaId}/propuestas`, {
        cuerpo: {
          monto_usdc: monto.trim(),
          dias_entrega: Number(dias),
          mensaje,
          local_id: localId || undefined,
          proyectos: adjuntos.filter((id) => misProyectos.some((x) => x.id === id)),
          ...(plan ? { fases: plan } : {}),
        },
      });
      onListo();
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="caja caja-aviso pila">
      <strong>Tu propuesta</strong>
      <div className="fila">
        <label className="etiqueta">
          Precio (USDC)
          <input className="campo" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} />
        </label>
        {!plan && (
          <label className="etiqueta">
            Días de entrega
            <input className="campo" type="number" min={1} max={90} value={dias} onChange={(e) => setDias(Number(e.target.value))} />
          </label>
        )}
      </div>
      {abiertos.length > 1 && (
        <label className="etiqueta">
          Desde qué local
          <select className="campo" value={localId} onChange={(e) => setLocalId(e.target.value)}>
            {abiertos.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nombre} · Villa {BARRIOS[l.barrio].nombre}
              </option>
            ))}
          </select>
        </label>
      )}
      {conFases && (
        <label className="fila pequeno">
          <input type="checkbox" checked={Boolean(plan)} onChange={(e) => setPlan(e.target.checked ? (inicial.plan ?? planInicial(Number(dias) || 7)) : null)} />
          Proponer un plan por fases (así te pueden pagar por etapas)
        </label>
      )}
      {plan && (
        <>
          <EditorPlan plan={plan} monto={monto} onCambiar={setPlan} />
          <span className="tenue pequeno">El plazo de la propuesta es hasta la fecha de la última fase.</span>
        </>
      )}
      {misProyectos.length > 0 && (
        <fieldset className="adjuntar-proyectos">
          <legend className="etiqueta">Adjuntar proyectos de tu portafolio (hasta 5)</legend>
          {misProyectos.map((x) => {
            const elegido = adjuntos.includes(x.id);
            return (
              <label key={x.id} className="fila pequeno">
                <input
                  type="checkbox"
                  checked={elegido}
                  disabled={!elegido && adjuntos.length >= 5}
                  onChange={(e) => setAdjuntos((a) => (e.target.checked ? [...a, x.id] : a.filter((id) => id !== x.id)))}
                />
                {x.titulo}
              </label>
            );
          })}
        </fieldset>
      )}
      <label className="etiqueta">
        Cuéntale cómo lo harías
        <textarea
          className="campo"
          rows={3}
          maxLength={1000}
          placeholder="Qué incluye, cómo trabajas, cuántas revisiones…"
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
        />
      </label>
      <span className="fila">
        <button type="button" className="boton boton-primario" disabled={enviando || mensaje.trim().length < 10 || !monto.trim()} onClick={enviar}>
          {enviando ? 'Enviando…' : textoBoton}
        </button>
        {onCancelar && (
          <button type="button" className="boton" onClick={onCancelar}>
            Cancelar
          </button>
        )}
      </span>
      <span className="tenue pequeno">Todavía no se cobra nada: si te eligen, se crea el pedido y el cliente paga en garantía.</span>
      {error && <Aviso tipo="peligro">{error}</Aviso>}
    </section>
  );
}

/** Proyectos del portafolio que trae una propuesta (los que ya no se ven no aparecen). */
function ProyectosAdjuntos({ ids }: { ids: string[] }) {
  const { abrir } = useEstado();
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const clave = ids.join(',');
  useEffect(() => {
    void cargarProyectos(clave.split(',')).then(setProyectos);
  }, [clave]);
  if (!proyectos.length) return null;
  return (
    <div className="pila-compacta">
      <span className="tenue pequeno">Proyectos que adjuntó</span>
      <div className="grilla-proyectos">
        {proyectos.map((p) => (
          <TarjetaProyecto key={p.id} proyecto={p} onAbrir={() => abrir({ tipo: 'proyecto', id: p.id })} />
        ))}
      </div>
    </div>
  );
}
