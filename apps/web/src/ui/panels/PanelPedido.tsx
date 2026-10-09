import { ACCIONES, ETIQUETA_ACCION, enlaceExplorador, enlaceTransaccion, permiteResena, puedeVerificar, type DefinicionAccion, type Parte } from '@cryptoville/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSesion } from '../../features/auth/sesion';
import { FirmarEnApp } from '../../features/escrow/FirmarEnApp';
import { PasoEnLab } from '../../features/escrow/PasoEnLab';
import { accionesPara, rolEnPedido } from '../../features/escrow/pasos';
import { cargarPedido, type PedidoDetalle } from '../../features/orders/datos';
import { api, mensajeDeError } from '../../lib/api';
import { obtenerConfig } from '../../lib/config';
import { useEstado } from '../estado';
import { Aviso, Avatar, Cargando, EstadoPedidoBadge, fechaCorta } from '../components/basicos';
import { Icono } from '../components/Iconos';
import { BotonReportar, Nombre } from '../components/Confianza';
import { PedidoV2 } from '../pagos/PedidoV2';
import { NOMBRE_METODO, type MetodoPago } from '@cryptoville/shared';

const ROL_TEXTO = { cliente: 'Eres el cliente', proveedor: 'Eres el proveedor', arbitro: 'Eres el árbitro' } as const;

export function PanelPedido({ id }: { id: string }) {
  const { usuario } = useSesion();
  const { version, refrescar, notificar, abrir } = useEstado();
  const [pedido, setPedido] = useState<PedidoDetalle | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const config = obtenerConfig();

  const cargar = useCallback(async () => {
    try {
      setPedido(await cargarPedido(id));
    } catch (e) {
      setError(mensajeDeError(e));
    }
  }, [id]);
  useEffect(() => {
    void cargar();
  }, [cargar, version]);

  if (!usuario) return <p className="tenue">Entra con tu wallet para ver tus pedidos.</p>;
  if (pedido === undefined) return <Cargando />;
  if (pedido === null) return <Aviso tipo="peligro">No encontramos este pedido o no participas en él.</Aviso>;

  const rol = rolEnPedido(pedido, usuario.id, usuario.rol === 'arbitro');
  if (!rol) return <Aviso tipo="peligro">No participas en este pedido.</Aviso>;
  // Contrato v2 (por etapas, garantía v2 y pago directo): aquí solo aceptar y cancelar; lo demás va en PedidoV2.
  const esV2 = pedido.contrato === 'v2';
  const acciones = accionesPara(pedido, rol, config.plazo_revision_seg).filter(
    ({ def }) => !esV2 || def.accion === 'cancelar' || (def.accion === 'aceptar' && pedido.metodo_pago !== 'etapas'),
  );
  const otro = rol === 'cliente' ? pedido.proveedor : pedido.cliente;
  const yaResene = pedido.resenas.some((r) => r.autor_id === usuario.id);

  const tras = async (texto: string) => {
    setAbierta(null);
    notificar(texto, pedido.id);
    refrescar();
    await cargar();
  };

  return (
    <div className="pila">
      <div className="fila espaciada">
        <div>
          <h3>{pedido.servicio.titulo}</h3>
          <span className="tenue pequeno">
            Pedido #{pedido.numero} · {ROL_TEXTO[rol]}
          </span>
          {pedido.metodo_pago && pedido.metodo_pago !== 'garantia' && (
            <span className={`chip ${pedido.metodo_pago === 'directo' ? 'chip-oro' : 'chip-info'}`}>{NOMBRE_METODO[pedido.metodo_pago as MetodoPago]}</span>
          )}
          {pedido.servicio.busqueda_id && (
            <button type="button" className="chip chip-oro chip-boton" onClick={() => abrir({ tipo: 'busqueda', id: pedido.servicio.busqueda_id! })}>
              <Icono nombre="chincheta" tamano={13} /> Nació de un «Se busca»
            </button>
          )}
        </div>
        <EstadoPedidoBadge estado={pedido.estado} />
      </div>
      {pedido.es_ejemplo && <Aviso>Pedido de ejemplo: muestra cómo se ve un pedido cerrado, sin transacciones reales en Stellar.</Aviso>}
      <dl className="datos">
        <dt>Monto</dt>
        <dd className="precio">{pedido.monto_usdc} USDC</dd>
        <dt>Cliente</dt>
        <dd className="fila">
          <Avatar frame={pedido.cliente.avatar} apariencia={pedido.cliente.apariencia} tamano={24} />{' '}
          <Nombre nombre={pedido.cliente.nombre} verificado={pedido.cliente.verificado} />
        </dd>
        <dt>Proveedor</dt>
        <dd className="fila">
          <Avatar frame={pedido.proveedor.avatar} apariencia={pedido.proveedor.apariencia} tamano={24} />{' '}
          <Nombre nombre={pedido.proveedor.nombre} verificado={pedido.proveedor.verificado} />
        </dd>
        <dt>Fecha límite</dt>
        <dd>{fechaCorta(pedido.fecha_limite)}</dd>
      </dl>
      <p className="cita">{pedido.detalle}</p>

      <h3>Qué sigue</h3>
      {acciones.length === 0 && !esV2 && <p className="tenue">{textoEspera(pedido, rol)}</p>}
      {acciones.map(({ def, bloqueada }) => (
        <div key={def.accion} className="accion">
          <button
            type="button"
            className={`boton ${def.accion === 'abrir_disputa' || def.accion === 'cancelar' || def.accion === 'rechazar' ? '' : 'boton-primario'}`}
            disabled={!!bloqueada}
            onClick={() => setAbierta(abierta === def.accion ? null : def.accion)}
            aria-expanded={abierta === def.accion}
          >
            {def.etiqueta} {def.enCadena && <span className="badge badge-info">{config.firma_en_app ? 'En la red' : 'Stellar Lab'}</span>}
          </button>
          {bloqueada && <span className="tenue pequeno">{bloqueada}</span>}
          {abierta === def.accion && (
            <AccionAbierta pedido={pedido} def={def} miDireccion={usuario.direccion} onListo={tras} onError={setError} />
          )}
        </div>
      ))}

      {esV2 && <PedidoV2 pedido={pedido} rol={rol} onListo={(t) => void tras(t)} />}

      <h3>Historial</h3>
      <ol className="historial">
        {pedido.pasos.map((p) => {
          const quien = p.declarado_por === pedido.cliente_id ? pedido.cliente.nombre : p.declarado_por === pedido.proveedor_id ? pedido.proveedor.nombre : 'Árbitro';
          return (
            <li key={p.id}>
              <strong>
                {ETIQUETA_ACCION[p.accion] ?? p.accion}
                {p.fase != null ? ' (fase ' + (p.fase + 1) + ')' : ''}
              </strong>{' '}
              <span className="tenue">· {quien} · {fechaCorta(p.creado_en)}</span>
              {p.hash && (
                <div className="fila pequeno">
                  <a href={enlaceTransaccion(p.hash, config.red)} target="_blank" rel="noreferrer">
                    Ver transacción en Stellar Lab <Icono nombre="enlace" tamano={14} />
                  </a>
                  <a href={enlaceExplorador('tx', p.hash, config.red)} target="_blank" rel="noreferrer noopener">
                    Explorador
                  </a>
                  {p.en_cadena ? (
                    <span className="badge badge-exito" title="WorkVille leyó la transacción en la red y coincide con el pedido">
                      Verificada en la red
                    </span>
                  ) : p.verificado_por ? (
                    <span className="badge badge-exito">Verificada</span>
                  ) : puedeVerificar(p.declarado_por, usuario.id, rol) ? (
                    <BotonVerificar pedidoId={pedido.id} pasoId={p.id} onListo={() => tras('Paso verificado')} onError={setError} />
                  ) : (
                    <span className="badge badge-aviso">Sin verificar</span>
                  )}
                </div>
              )}
            </li>
          );
        })}
        {pedido.pasos.length === 0 && <li className="tenue">Pedido creado el {fechaCorta(pedido.creado_en)}.</li>}
      </ol>

      {pedido.disputa && (
        <>
          <h3>Disputa</h3>
          <Aviso tipo={pedido.disputa.ganador ? 'exito' : 'peligro'}>
            <p>
              <strong>Motivo:</strong> {pedido.disputa.motivo}
            </p>
            {pedido.disputa.ganador ? (
              <p>
                <strong>Decisión ({pedido.disputa.ganador === 'Cliente' ? 'a favor del cliente' : 'a favor del proveedor'}):</strong>{' '}
                {pedido.disputa.decision}
              </p>
            ) : (
              <p>El dinero está congelado en el contrato hasta que el árbitro decida.</p>
            )}
          </Aviso>
        </>
      )}

      {permiteResena(pedido.estado) && rol !== 'arbitro' && !yaResene && (
        <FormularioResena pedidoId={pedido.id} nombre={otro.nombre} onListo={() => tras('¡Gracias por tu reseña!')} />
      )}

      <Chat pedido={pedido} usuarioId={usuario.id} rol={rol} onError={setError} />
      {error && <Aviso tipo="peligro">{error}</Aviso>}
    </div>
  );
}

function textoEspera(p: PedidoDetalle, rol: string): string {
  switch (p.estado) {
    case 'solicitado':
      return rol === 'cliente' ? 'Esperando que el proveedor acepte tu pedido.' : '—';
    case 'aceptado':
      return 'Esperando el pago en garantía del cliente.';
    case 'pagado':
      return 'El pago está en garantía. Esperando la entrega.';
    case 'entregado':
      return 'Entregado. Esperando que el cliente libere el pago.';
    case 'en_disputa':
      return 'Esperando la decisión del árbitro.';
    default:
      return 'Este pedido está cerrado.';
  }
}

function AccionAbierta({
  pedido,
  def,
  miDireccion,
  onListo,
  onError,
}: {
  pedido: PedidoDetalle;
  def: DefinicionAccion;
  miDireccion: string;
  onListo: (texto: string) => void;
  onError: (e: string | null) => void;
}) {
  if (def.enCadena) {
    return <PasoDelContrato pedido={pedido} def={def} miDireccion={miDireccion} onListo={onListo} />;
  }
  if (def.accion === 'aceptar') return <FormularioAceptar pedido={pedido} onListo={() => onListo('Pedido aceptado')} onError={onError} />;
  return (
    <div className="paso-lab">
      <p>{def.ayuda}</p>
      <button
        type="button"
        className="boton boton-peligro"
        onClick={async () => {
          onError(null);
          try {
            await api(`/pedidos/${pedido.id}/cancelar`, { cuerpo: {} });
            onListo('Pedido cancelado');
          } catch (e) {
            onError(mensajeDeError(e));
          }
        }}
      >
        Sí, cancelar el pedido
      </button>
    </div>
  );
}

/**
 * Un paso del contrato: se firma dentro de la app (si el servidor lo permite) o, como opción avanzada, en Stellar Lab.
 * El motivo de una disputa y la decisión del árbitro se escriben aquí en los dos casos.
 */
function PasoDelContrato({
  pedido,
  def,
  miDireccion,
  onListo,
}: {
  pedido: PedidoDetalle;
  def: DefinicionAccion;
  miDireccion: string;
  onListo: (texto: string) => void;
}) {
  const config = obtenerConfig();
  const [motivo, setMotivo] = useState('');
  const [decision, setDecision] = useState('');
  const [aFavorDe, setAFavorDe] = useState<Parte>('Cliente');
  if (!config.firma_en_app) {
    return <PasoEnLab pedido={pedido} def={def} miDireccion={miDireccion} onListo={() => onListo(`Paso registrado: ${def.etiqueta}`)} />;
  }
  const faltaTexto =
    (def.accion === 'abrir_disputa' && motivo.trim().length < 10) || (def.accion === 'resolver' && decision.trim().length < 10);
  return (
    <div className="paso-lab">
      <p>{def.ayuda}</p>
      {def.accion === 'abrir_disputa' && (
        <>
          <label className="etiqueta" htmlFor="motivo-app">
            Motivo de la disputa (lo lee el árbitro)
          </label>
          <textarea id="motivo-app" className="campo" rows={3} maxLength={1000} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </>
      )}
      {def.accion === 'resolver' && (
        <>
          <label className="etiqueta" htmlFor="a-favor">
            A favor de
          </label>
          <select id="a-favor" className="campo" value={aFavorDe} onChange={(e) => setAFavorDe(e.target.value as Parte)}>
            <option value="Cliente">Cliente ({pedido.cliente.nombre})</option>
            <option value="Proveedor">Proveedor ({pedido.proveedor.nombre})</option>
          </select>
          <label className="etiqueta" htmlFor="decision-app">
            Explicación de la decisión (la ven las dos partes)
          </label>
          <textarea id="decision-app" className="campo" rows={3} maxLength={1000} value={decision} onChange={(e) => setDecision(e.target.value)} />
        </>
      )}
      <FirmarEnApp
        pedidoId={pedido.id}
        accion={def.accion}
        etiqueta={def.etiqueta}
        deshabilitado={faltaTexto}
        extra={{
          ...(def.accion === 'abrir_disputa' ? { motivo } : {}),
          ...(def.accion === 'resolver' ? { decision, a_favor_de: aFavorDe } : {}),
        }}
        onListo={() => onListo(`Paso hecho: ${def.etiqueta}`)}
      />
      <details className="pequeno">
        <summary>Avanzado: hacerlo en Stellar Lab</summary>
        <PasoEnLab pedido={pedido} def={def} miDireccion={miDireccion} onListo={() => onListo(`Paso registrado: ${def.etiqueta}`)} />
      </details>
    </div>
  );
}

function FormularioAceptar({ pedido, onListo, onError }: { pedido: PedidoDetalle; onListo: () => void; onError: (e: string | null) => void }) {
  const manana = new Date(Date.now() + 7 * 86_400_000);
  manana.setMinutes(0, 0, 0);
  const local = new Date(manana.getTime() - manana.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  const [fecha, setFecha] = useState(local);
  const [monto, setMonto] = useState(pedido.monto_usdc);
  return (
    <div className="paso-lab">
      <p>{ACCIONES.aceptar.ayuda} Después el cliente paga en garantía; no puedes cambiar estos datos.</p>
      <label className="etiqueta" htmlFor="fecha">
        Fecha límite de entrega
      </label>
      <input id="fecha" type="datetime-local" className="campo" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      <label className="etiqueta" htmlFor="monto">
        Precio final (USDC)
      </label>
      <input id="monto" className="campo" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} />
      <button
        type="button"
        className="boton boton-primario"
        onClick={async () => {
          onError(null);
          try {
            await api(`/pedidos/${pedido.id}/aceptar`, { cuerpo: { fecha_limite: new Date(fecha).toISOString(), monto_usdc: monto } });
            onListo();
          } catch (e) {
            onError(mensajeDeError(e));
          }
        }}
      >
        Aceptar pedido
      </button>
    </div>
  );
}

function BotonVerificar({ pedidoId, pasoId, onListo, onError }: { pedidoId: string; pasoId: string; onListo: () => void; onError: (e: string) => void }) {
  return (
    <button
      type="button"
      className="boton boton-mini"
      title="Confirma que revisaste la transacción en Stellar Lab y es correcta"
      onClick={async () => {
        try {
          await api(`/pedidos/${pedidoId}/pasos/${pasoId}/verificar`, { cuerpo: {} });
          onListo();
        } catch (e) {
          onError(mensajeDeError(e));
        }
      }}
    >
      La revisé: verificar
    </button>
  );
}

function FormularioResena({ pedidoId, nombre, onListo }: { pedidoId: string; nombre: string; onListo: () => void }) {
  const [nota, setNota] = useState(5);
  const [comentario, setComentario] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="caja caja-exito pila">
      <strong>Deja una reseña para {nombre}</strong>
      <div className="estrellas-elegir" role="radiogroup" aria-label="Calificación">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={n === nota} className={n <= nota ? 'activa' : ''} onClick={() => setNota(n)}>
            ★
          </button>
        ))}
      </div>
      <textarea className="campo" rows={2} maxLength={500} placeholder="¿Cómo te fue? (opcional)" value={comentario} onChange={(e) => setComentario(e.target.value)} />
      <button
        type="button"
        className="boton boton-primario"
        onClick={async () => {
          try {
            await api(`/pedidos/${pedidoId}/resenas`, { cuerpo: { calificacion: nota, comentario } });
            onListo();
          } catch (e) {
            setError(mensajeDeError(e));
          }
        }}
      >
        Publicar reseña
      </button>
      {error && <Aviso tipo="peligro">{error}</Aviso>}
    </div>
  );
}

function Chat({ pedido, usuarioId, rol, onError }: { pedido: PedidoDetalle; usuarioId: string; rol: string; onError: (e: string) => void }) {
  const [texto, setTexto] = useState('');
  const fin = useRef<HTMLLIElement>(null);
  const puedeEscribir = rol !== 'arbitro' || pedido.estado === 'en_disputa' || pedido.estado === 'resuelto';
  const nombre = (id: string) => (id === pedido.cliente_id ? pedido.cliente.nombre : id === pedido.proveedor_id ? pedido.proveedor.nombre : 'Árbitro');
  useEffect(() => {
    fin.current?.scrollIntoView({ block: 'nearest' });
  }, [pedido.mensajes.length]);

  return (
    <section className="chat">
      <h3>
        <Icono nombre="chat" /> Chat del pedido
      </h3>
      <ul>
        {pedido.mensajes.map((m) => (
          <li key={m.id} className={m.autor_id === usuarioId ? 'mio' : ''}>
            <span className="tenue pequeno">
              {nombre(m.autor_id)} · {fechaCorta(m.creado_en)}
            </span>
            <p>{m.texto}</p>
            {m.autor_id !== usuarioId && <BotonReportar tipo="mensaje" objetoId={m.id} nombre={'un mensaje de ' + nombre(m.autor_id)} />}
          </li>
        ))}
        {pedido.mensajes.length === 0 && <li className="tenue">Todavía no hay mensajes.</li>}
        <li ref={fin} aria-hidden />
      </ul>
      {puedeEscribir && (
        <form
          className="fila"
          onSubmit={async (e) => {
            e.preventDefault();
            const t = texto.trim();
            if (!t) return;
            setTexto('');
            try {
              await api(`/pedidos/${pedido.id}/mensajes`, { cuerpo: { texto: t } });
            } catch (err) {
              setTexto(t);
              onError(mensajeDeError(err));
            }
          }}
        >
          <input className="campo" placeholder="Escribe un mensaje…" maxLength={1000} value={texto} onChange={(e) => setTexto(e.target.value)} />
          <button type="submit" className="boton boton-primario">
            Enviar
          </button>
        </form>
      )}
    </section>
  );
}
