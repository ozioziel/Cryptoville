import { useCallback, useEffect, useState } from 'react';
import { useSesion } from '../../features/auth/sesion';
import { cargarDisputas, cargarDisputasFases, type DisputaArbitro, type DisputaFaseArbitro, type PedidoResumen } from '../../features/orders/datos';
import { api, mensajeDeError } from '../../lib/api';
import { obtenerConfig, plazosV2 } from '../../lib/config';
import { supabase } from '../../lib/supabase';
import { useEstado } from '../estado';
import { Aviso, Cargando, EstadoPedidoBadge, fechaCorta } from '../components/basicos';
import { Pestanas } from '../components/Editor';

/** Disputas (abiertas y resueltas) y la cola de reportes. Para resolver una disputa se abre el pedido. */
export function PanelArbitro() {
  const { usuario } = useSesion();
  const [pestana, setPestana] = useState<'disputas' | 'reportes'>('disputas');
  if (usuario?.rol !== 'arbitro') return <Aviso tipo="peligro">Solo el árbitro puede ver este panel.</Aviso>;
  return (
    <div className="pila">
      <Pestanas
        etiqueta="Panel del árbitro"
        opciones={[
          { id: 'disputas', nombre: 'Disputas' },
          { id: 'reportes', nombre: 'Reportes' },
        ]}
        valor={pestana}
        onCambiar={setPestana}
      />
      {pestana === 'disputas' ? <Disputas /> : <Reportes />}
    </div>
  );
}

/** Una fila del panel: una disputa del v1 (tabla `disputas`) o la de una fase del v2 (en la fila de la fase). */
interface FilaDisputa {
  clave: string;
  pedido: PedidoResumen;
  motivo: string;
  desde: string;
  abierta: boolean;
  /** Solo v2: «Fase 2 · 30 USDC». */
  fase?: string;
  /** Solo v2: desde cuándo cualquiera puede repartir 50/50 si el árbitro no decide. */
  vence?: Date;
}

function filasDeDisputas(v1: DisputaArbitro[], v2: DisputaFaseArbitro[]): FilaDisputa[] {
  const { disputaMaxSeg } = plazosV2();
  return [
    ...v1.map((d) => ({ clave: `v1-${d.id}`, pedido: d.pedido, motivo: d.motivo, desde: d.creado_en, abierta: !d.ganador })),
    ...v2.map((f) => ({
      clave: `v2-${f.id}`,
      pedido: f.pedido,
      motivo: f.motivo_disputa ?? 'Sin motivo',
      desde: f.disputa_desde,
      abierta: f.estado === 'en_disputa',
      fase: `Fase ${f.numero + 1} · ${f.monto_usdc} USDC`,
      vence: new Date(Date.parse(f.disputa_desde) + disputaMaxSeg * 1000),
    })),
  ].sort((a, b) => b.desde.localeCompare(a.desde));
}

function Disputas() {
  const { abrir, version } = useEstado();
  const [filas, setFilas] = useState<FilaDisputa[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const config = obtenerConfig();

  useEffect(() => {
    // Las del v1 solo existen si hay contrato v1; las de las fases, si hay v2.
    Promise.all([config.contrato_id ? cargarDisputas() : [], config.contrato_v2_id ? cargarDisputasFases() : []]).then(
      ([v1, v2]) => setFilas(filasDeDisputas(v1, v2)),
      (e) => setError(mensajeDeError(e)),
    );
  }, [version, config.contrato_id, config.contrato_v2_id]);

  if (error) return <Aviso tipo="peligro">{error}</Aviso>;
  if (!filas) return <Cargando />;

  const abiertas = filas.filter((d) => d.abierta);
  const resueltas = filas.filter((d) => !d.abierta);
  const lista = (items: FilaDisputa[]) => (
    <ul className="lista-tarjetas">
      {items.map((d) => (
        <li key={d.clave}>
          <button type="button" className="tarjeta" onClick={() => abrir({ tipo: 'pedido', id: d.pedido.id })}>
            <span className="fila espaciada">
              <span className="tarjeta-titulo">
                #{d.pedido.numero} · {d.pedido.servicio.titulo}
              </span>
              <EstadoPedidoBadge estado={d.pedido.estado} />
            </span>
            <span className="pequeno">
              {d.pedido.cliente.nombre} (cliente) vs. {d.pedido.proveedor.nombre} (proveedor) · {d.fase ?? `${d.pedido.monto_usdc} USDC`}
            </span>
            <span className="tenue pequeno">
              «{d.motivo}» · {fechaCorta(d.desde)}
            </span>
            {d.abierta && d.vence && (
              d.vence.getTime() < Date.now() ? (
                <span className="badge badge-peligro">Venció el plazo: cualquiera puede repartirla 50/50</span>
              ) : (
                <span className="tenue pequeno">Si no decides antes del {fechaCorta(d.vence.toISOString())}, cualquiera puede repartirla 50/50</span>
              )
            )}
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <p className="tenue pequeno">
        Revisa el expediente: el chat, el historial y las pruebas del pedido. Resuelve desde el pedido (en la fase en disputa, «Resolver») y firma
        con la wallet del árbitro del contrato.
        {config.contrato_id && !config.firma_en_app && ' En los pedidos del contrato v1, resuelve en Stellar Lab con la función resolver y registra el hash.'}
      </p>
      <h3>Abiertas ({abiertas.length})</h3>
      {abiertas.length ? lista(abiertas) : <p className="tenue">No hay disputas abiertas.</p>}
      <h3>Resueltas ({resueltas.length})</h3>
      {resueltas.length ? lista(resueltas) : <p className="tenue">Todavía no se resolvió ninguna.</p>}
    </>
  );
}

interface ReporteEquipo {
  id: string;
  tipo: string;
  objeto_id: string;
  motivo: string;
  detalle: string | null;
  estado: 'abierto' | 'descartado' | 'resuelto';
  resolucion: string | null;
  creado_en: string;
  autor: { id: string; nombre: string };
  denunciado: { id: string; nombre: string; suspendido: boolean; verificado: boolean } | null;
}

const MOTIVO: Record<string, string> = {
  estafa: 'Estafa',
  ofensivo: 'Ofensivo',
  spam: 'Spam',
  ilegal: 'Ilegal',
  suplantacion: 'Suplantación',
  derechos: 'Trabajo ajeno',
  otro: 'Otro',
};

function Reportes() {
  const { avisar } = useEstado();
  const [reportes, setReportes] = useState<ReporteEquipo[] | null>(null);
  const [resolucion, setResolucion] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const cargar = useCallback(() => api<ReporteEquipo[]>('/arbitro/reportes').then(setReportes, (e) => setError(mensajeDeError(e))), []);
  useEffect(() => {
    void cargar();
  }, [cargar]);
  if (error) return <Aviso tipo="peligro">{error}</Aviso>;
  if (!reportes) return <Cargando />;
  if (!reportes.length) return <p className="tenue">No llegó ningún reporte.</p>;

  const resolver = async (r: ReporteEquipo, accion: 'descartar' | 'ocultar' | 'suspender') => {
    if (accion === 'suspender' && !window.confirm(`¿Suspender la cuenta de ${r.denunciado?.nombre}? Sus locales y «Se busca» dejan de verse.`)) return;
    try {
      await api(`/arbitro/reportes/${r.id}/resolver`, { cuerpo: { accion, resolucion: resolucion[r.id] ?? '' } });
      avisar('Reporte revisado', 'exito');
      await cargar();
    } catch (e) {
      avisar(mensajeDeError(e), 'error');
    }
  };

  return (
    <ul className="lista-tarjetas">
      {reportes.map((r) => (
        <li key={r.id} className={`tarjeta ${r.estado === 'abierto' ? 'comentario-nuevo' : 'comentario-resuelto'}`}>
          <span className="fila espaciada">
            <strong>
              {MOTIVO[r.motivo] ?? r.motivo} · {r.tipo}
            </strong>
            <span className="tenue pequeno">{fechaCorta(r.creado_en)}</span>
          </span>
          <span className="pequeno">
            {r.autor.nombre} reporta a <b>{r.denunciado?.nombre ?? '—'}</b>
            {r.denunciado?.suspendido ? ' (suspendida)' : ''}
          </span>
          {r.detalle && <p className="texto-largo">«{r.detalle}»</p>}
          <span className="tenue pequeno">Contenido: {r.objeto_id}</span>
          {r.tipo === 'chat' && <ConversacionReportada autorId={r.autor.id} denunciadoId={r.objeto_id} nombres={{ [r.autor.id]: r.autor.nombre, [r.objeto_id]: r.denunciado?.nombre ?? '—' }} />}
          {r.tipo === 'proyecto' && <BotonVer tipo="proyecto" id={r.objeto_id} />}
          {r.estado === 'abierto' ? (
            <>
              <input
                className="campo"
                placeholder="Decisión (la ve quien reportó)"
                value={resolucion[r.id] ?? ''}
                onChange={(e) => setResolucion((x) => ({ ...x, [r.id]: e.target.value }))}
              />
              <div className="fila">
                <button type="button" className="boton boton-mini" disabled={(resolucion[r.id] ?? '').trim().length < 5} onClick={() => resolver(r, 'descartar')}>
                  Descartar
                </button>
                <button type="button" className="boton boton-mini" disabled={(resolucion[r.id] ?? '').trim().length < 5} onClick={() => resolver(r, 'ocultar')}>
                  Ocultar contenido
                </button>
                <button
                  type="button"
                  className="boton boton-mini boton-peligro"
                  disabled={(resolucion[r.id] ?? '').trim().length < 5 || !r.denunciado}
                  onClick={() => resolver(r, 'suspender')}
                >
                  Suspender cuenta
                </button>
              </div>
            </>
          ) : (
            <span className="tenue pequeno">
              {r.estado === 'descartado' ? 'Descartado' : 'Resuelto'}: {r.resolucion}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function BotonVer({ tipo, id }: { tipo: 'proyecto'; id: string }) {
  const { abrir } = useEstado();
  return (
    <button type="button" className="boton boton-mini" onClick={() => abrir({ tipo, id })}>
      Ver el proyecto
    </button>
  );
}

/** Chat por cercanía reportado: la conversación de los últimos días entre las dos personas (el equipo la lee por RLS). */
function ConversacionReportada({ autorId, denunciadoId, nombres }: { autorId: string; denunciadoId: string; nombres: Record<string, string> }) {
  const [mensajes, setMensajes] = useState<{ id: string; de_id: string; texto: string; creado_en: string; oculto: boolean }[] | null>(null);
  const [abierta, setAbierta] = useState(false);
  useEffect(() => {
    if (!abierta || mensajes) return;
    void supabase()
      .from('mensajes_cercania')
      .select('id, de_id, texto, creado_en, oculto')
      .or(`and(de_id.eq.${autorId},para_id.eq.${denunciadoId}),and(de_id.eq.${denunciadoId},para_id.eq.${autorId})`)
      .order('creado_en')
      .limit(300)
      .then(({ data }) => setMensajes((data ?? []) as { id: string; de_id: string; texto: string; creado_en: string; oculto: boolean }[]));
  }, [abierta, mensajes, autorId, denunciadoId]);
  return (
    <details onToggle={(e) => setAbierta((e.target as HTMLDetailsElement).open)}>
      <summary className="pequeno">Ver la conversación</summary>
      {!mensajes ? (
        <Cargando />
      ) : mensajes.length === 0 ? (
        <p className="tenue pequeno">Ya no quedan mensajes (se borran a los 7 días si no hay un reporte abierto).</p>
      ) : (
        <ol className="lista-simple pequeno">
          {mensajes.map((m) => (
            <li key={m.id}>
              <b>{nombres[m.de_id] ?? 'Alguien'}</b> · <span className="tenue">{fechaCorta(m.creado_en)}</span>
              {m.oculto && <span className="badge badge-apagado">Oculto</span>}
              <br />
              {m.texto}
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
