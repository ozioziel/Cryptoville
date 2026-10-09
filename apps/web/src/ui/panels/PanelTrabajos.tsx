import { enlaceExplorador, esTrabajoPublicable, reglasDe, type RolTrabajo } from '@cryptoville/shared';
import { useCallback, useEffect, useState } from 'react';
import { useSesion } from '../../features/auth/sesion';
import { cargarMisTrabajos, cargarTrabajosVerificados, type MiTrabajo, type TrabajoVerificado } from '../../features/trabajos/datos';
import { api, mensajeDeError } from '../../lib/api';
import { obtenerConfig } from '../../lib/config';
import { supabase } from '../../lib/supabase';
import { useEstado } from '../estado';
import { Aviso, Avatar, Cargando, EstadoPedidoBadge } from '../components/basicos';
import { BotonReportar, Nombre } from '../components/Confianza';
import { Pestanas } from '../components/Editor';
import { Icono } from '../components/Iconos';

/** «12 oct. 2026». */
const fechaTrabajo = (iso: string) => new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });

/** Estrellas chicas de una sola reseña (1 a 5). */
function EstrellasTrabajo({ valor }: { valor: number | null }) {
  if (valor === null) return <span className="tenue pequeno">Sin reseña</span>;
  return (
    <span className="estrellas pequeno" aria-label={`${valor} de 5 estrellas`}>
      {'★'.repeat(valor)}
      <span className="estrellas-vacias">{'★'.repeat(5 - valor)}</span>
    </span>
  );
}

/**
 * «Mostrar en mi perfil público» / «Quitar de mi perfil». Si no se le dice si ya está, lo lee
 * (por ejemplo, desde el historial de un pedido).
 */
export function BotonTrabajoPublico({ pedidoId, publico: inicial, onCambio }: { pedidoId: string; publico?: boolean; onCambio?: (publico: boolean) => void }) {
  const { usuario } = useSesion();
  const { avisar } = useEstado();
  const [publico, setPublico] = useState<boolean | undefined>(inicial);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => setPublico(inicial), [inicial]);
  useEffect(() => {
    if (inicial !== undefined || !usuario) return;
    void supabase()
      .from('trabajos_publicos')
      .select('id')
      .eq('usuario_id', usuario.id)
      .eq('pedido_id', pedidoId)
      .maybeSingle()
      .then(({ data }) => setPublico(Boolean(data)));
  }, [inicial, usuario, pedidoId]);

  if (!usuario || publico === undefined) return null;

  const cambiar = async () => {
    setOcupado(true);
    try {
      await api(`/trabajos-publicos/${pedidoId}`, { metodo: publico ? 'DELETE' : 'POST' });
      const ahora = !publico;
      setPublico(ahora);
      onCambio?.(ahora);
      avisar(ahora ? 'Listo: se ve en tu perfil público como trabajo verificado' : 'Lo quitaste de tu perfil público', 'exito');
    } catch (e) {
      avisar(mensajeDeError(e), 'error');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <button type="button" className={`boton boton-mini ${publico ? '' : 'boton-primario'}`} disabled={ocupado} onClick={cambiar} aria-pressed={publico}>
      <Icono nombre={publico ? 'cerrar' : 'escudo'} tamano={14} /> {publico ? 'Quitar de mi perfil público' : 'Mostrar en mi perfil público'}
    </button>
  );
}

/** Perfil → «Mis trabajos»: los pedidos terminados (privado) y cuáles se muestran en público. */
export function PanelMisTrabajos() {
  const { usuario } = useSesion();
  const { abrir, version } = useEstado();
  const [rol, setRol] = useState<RolTrabajo>('proveedor');
  const [trabajos, setTrabajos] = useState<MiTrabajo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const max = reglasDe(obtenerConfig().red).trabajos.maxPublicos;

  const cargar = useCallback(async () => {
    if (!usuario) return;
    try {
      setTrabajos(await cargarMisTrabajos(usuario.id));
    } catch (e) {
      setError(mensajeDeError(e));
    }
  }, [usuario]);
  useEffect(() => {
    void cargar();
  }, [cargar, version]);

  if (!usuario) return <p className="tenue">Entra para ver tus trabajos.</p>;
  if (error) return <Aviso tipo="peligro">{error}</Aviso>;
  if (!trabajos) return <Cargando />;

  const lista = trabajos.filter((t) => t.rol === rol);
  const publicos = trabajos.filter((t) => t.publico).length;

  return (
    <div className="pila">
      <p className="tenue pequeno">
        Tus pedidos terminados. <b>Solo tú ves esta lista y los montos.</b> Elige hasta {max} para mostrar en tu perfil público como «Trabajos
        verificados»: ahí se ven el título, la fecha, las estrellas y la transacción en Stellar, nunca el monto ni el detalle.
      </p>
      <div className="fila espaciada">
        <Pestanas
          etiqueta="Mis trabajos"
          opciones={[
            { id: 'proveedor', nombre: `Como proveedor (${trabajos.filter((t) => t.rol === 'proveedor').length})` },
            { id: 'cliente', nombre: `Como cliente (${trabajos.filter((t) => t.rol === 'cliente').length})` },
          ]}
          valor={rol}
          onCambiar={setRol}
        />
        <span className="badge badge-info">
          En tu perfil: {publicos}/{max}
        </span>
      </div>
      {lista.length === 0 && (
        <p className="tenue">{rol === 'proveedor' ? 'Todavía no terminaste trabajos como proveedor.' : 'Todavía no terminaste pedidos como cliente.'}</p>
      )}
      <ul className="lista-tarjetas">
        {lista.map((t) => (
          <li key={t.pedidoId} className="trabajo">
            <div className="trabajo-cabeza">
              <span className="trabajo-texto">
                <b>{t.titulo}</b>
                <span className="fila pequeno trabajo-persona">
                  <span className="tenue">
                    {fechaTrabajo(t.terminadoEn)} · {rol === 'proveedor' ? 'para' : 'de'}
                  </span>
                  <Avatar frame={t.otro.avatar} apariencia={t.otro.apariencia} tamano={20} />
                  <Nombre nombre={t.otro.nombre} verificado={t.otro.verificado} />
                </span>
              </span>
              <span className="trabajo-monto" title="Solo tú ves el monto">
                {t.montoUsdc} USDC
              </span>
            </div>
            <div className="fila espaciada pequeno">
              <EstrellasTrabajo valor={t.estrellas} />
              {t.estado === 'resuelto' && <EstadoPedidoBadge estado={t.estado} />}
              {t.publico && <span className="badge badge-exito">En tu perfil público</span>}
            </div>
            <div className="fila">
              {esTrabajoPublicable(t.estado) ? (
                <BotonTrabajoPublico pedidoId={t.pedidoId} publico={t.publico} onCambio={() => void cargar()} />
              ) : (
                <span className="tenue pequeno">Las disputas resueltas no se muestran en público.</span>
              )}
              {rol === 'proveedor' && (
                <button type="button" className="boton boton-mini" onClick={() => abrir({ tipo: 'mi-portafolio', nuevoProyecto: { titulo: t.titulo } })}>
                  <Icono nombre="cuadro" tamano={14} /> Pasar a mi portafolio
                </button>
              )}
              <button type="button" className="boton boton-mini" onClick={() => abrir({ tipo: 'pedido', id: t.pedidoId })}>
                Ver pedido
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button type="button" className="boton" onClick={() => abrir({ tipo: 'portafolio', usuarioId: usuario.id })}>
        Ver mi perfil público
      </button>
    </div>
  );
}

/** «Trabajos verificados» en el perfil público: sin montos ni detalle, con el sello y la transacción. */
export function TrabajosVerificados({ usuarioId, titulo = 'Trabajos verificados' }: { usuarioId: string; titulo?: string }) {
  const { usuario } = useSesion();
  const [trabajos, setTrabajos] = useState<TrabajoVerificado[] | null>(null);
  const red = obtenerConfig().red;

  useEffect(() => {
    cargarTrabajosVerificados(usuarioId).then(setTrabajos, () => setTrabajos([]));
  }, [usuarioId]);

  if (!trabajos) return null;
  const esMio = usuario?.id === usuarioId;
  if (!trabajos.length && !esMio) return null;

  return (
    <section className="pila-compacta">
      <h3>{titulo}</h3>
      {trabajos.length === 0 && <p className="tenue pequeno">Todavía no elegiste trabajos para mostrar. Hazlo en Perfil → «Mis trabajos».</p>}
      <ul className="trabajos-verificados">
        {trabajos.map((t) => (
          <li key={t.id} className="trabajo-verificado">
            <span className="sello-stellar" aria-hidden="true">
              <Icono nombre="escudo" tamano={20} />
            </span>
            <span className="trabajo-verificado-texto">
              <b>{t.titulo}</b>
              <span className="tenue pequeno">
                {fechaTrabajo(t.terminado_en)} · {t.rol === 'proveedor' ? 'como proveedor' : 'como cliente'}
              </span>
              <EstrellasTrabajo valor={t.estrellas} />
              {t.tx_hash ? (
                <a className="sello-enlace pequeno" href={enlaceExplorador('tx', t.tx_hash, red)} target="_blank" rel="noreferrer noopener">
                  Pagado y terminado en Stellar <Icono nombre="enlace" tamano={12} />
                </a>
              ) : (
                <span className="tenue pequeno">Pedido de ejemplo (sin transacción)</span>
              )}
            </span>
            {!esMio && <BotonReportar tipo="trabajo_publico" objetoId={t.id} nombre={`«${t.titulo}»`} />}
          </li>
        ))}
      </ul>
    </section>
  );
}
