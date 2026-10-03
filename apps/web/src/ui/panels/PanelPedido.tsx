import { ACCIONES, enlaceTransaccion, permiteResena, puedeVerificar, type DefinicionAccion } from '@cryptoville/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSesion } from '../../features/auth/sesion';
import { PasoEnLab } from '../../features/escrow/PasoEnLab';
import { accionesPara, rolEnPedido } from '../../features/escrow/pasos';
import { cargarPedido, type PedidoDetalle } from '../../features/orders/datos';
import { api, mensajeDeError } from '../../lib/api';
import { obtenerConfig } from '../../lib/config';
import { useEstado } from '../estado';
import { Aviso, Avatar, Cargando, EstadoPedidoBadge, fechaCorta } from '../components/basicos';

const ROL_TEXTO = { cliente: 'Eres el cliente', proveedor: 'Eres el proveedor', arbitro: 'Eres el árbitro' } as const;

export function PanelPedido({ id }: { id: string }) {
  const { usuario } = useSesion();
  const { version, refrescar, notificar } = useEstado();
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
  const acciones = accionesPara(pedido, rol, config.plazo_revision_seg);
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
        </div>
        <EstadoPedidoBadge estado={pedido.estado} />
      </div>
      {pedido.es_ejemplo && <Aviso>Pedido de ejemplo: muestra cómo se ve un pedido cerrado, sin transacciones reales en Stellar.</Aviso>}
      <dl className="datos">
        <dt>Monto</dt>
        <dd className="precio">{pedido.monto_usdc} USDC</dd>
        <dt>Cliente</dt>
        <dd className="fila">
          <Avatar frame={pedido.cliente.avatar} tamano={20} /> {pedido.cliente.nombre}
        </dd>
        <dt>Proveedor</dt>
        <dd className="fila">
          <Avatar frame={pedido.proveedor.avatar} tamano={20} /> {pedido.proveedor.nombre}
        </dd>
        <dt>Fecha límite</dt>
        <dd>{fechaCorta(pedido.fecha_limite)}</dd>
      </dl>
      <p className="cita">{pedido.detalle}</p>

      <h3>Qué sigue</h3>
      {acciones.length === 0 && <p className="tenue">{textoEspera(pedido, rol)}</p>}
      {acciones.map(({ def, bloqueada }) => (
        <div key={def.accion} className="accion">
          <button
            type="button"
            className={`boton ${def.accion === 'abrir_disputa' || def.accion === 'cancelar' || def.accion === 'rechazar' ? '' : 'boton-primario'}`}
            disabled={!!bloqueada}
            onClick={() => setAbierta(abierta === def.accion ? null : def.accion)}
            aria-expanded={abierta === def.accion}
          >
            {def.etiqueta} {def.enCadena && <span className="badge badge-info">Stellar Lab</span>}
          </button>
          {bloqueada && <span className="tenue pequeno">{bloqueada}</span>}
          {abierta === def.accion && (
            <AccionAbierta pedido={pedido} def={def} miDireccion={usuario.direccion} onListo={tras} onError={setError} />
          )}
        </div>
      ))}

      <h3>Historial</h3>
      <ol className="historial">
        {pedido.pasos.map((p) => {
          const quien = p.declarado_por === pedido.cliente_id ? pedido.cliente.nombre : p.declarado_por === pedido.proveedor_id ? pedido.proveedor.nombre : 'Árbitro';
          return (
            <li key={p.id}>
              <strong>{ACCIONES[p.accion].etiqueta}</strong> <span className="tenue">· {quien} · {fechaCorta(p.creado_en)}</span>
              {p.hash && (
                <div className="fila pequeno">
                  <a href={enlaceTransaccion(p.hash, config.red)} target="_blank" rel="noreferrer">
                    Ver transacción en Stellar Lab ↗
                  </a>
                  {p.verificado_por ? (
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
    return <PasoEnLab pedido={pedido} def={def} miDireccion={miDireccion} onListo={() => onListo(`Paso registrado: ${def.etiqueta}`)} />;
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
      <h3>Chat del pedido</h3>
      <ul>
        {pedido.mensajes.map((m) => (
          <li key={m.id} className={m.autor_id === usuarioId ? 'mio' : ''}>
            <span className="tenue pequeno">
              {nombre(m.autor_id)} · {fechaCorta(m.creado_en)}
            </span>
            <p>{m.texto}</p>
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
          <button type="submit" className="boton">
            Enviar
          </button>
        </form>
      )}
    </section>
  );
}
