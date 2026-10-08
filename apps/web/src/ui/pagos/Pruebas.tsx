import { NOMBRE_PRUEBA, reglasDe, type TipoPrueba } from '@cryptoville/shared';
import { useEffect, useRef, useState } from 'react';
import type { PruebaDeFase } from '../../features/pagos/datos';
import { api, mensajeDeError } from '../../lib/api';
import { obtenerConfig, servicios } from '../../lib/config';
import { supabase } from '../../lib/supabase';
import { useEstado } from '../estado';
import { Aviso, fechaCorta } from '../components/basicos';
import { Icono, type NombreIcono } from '../components/Iconos';

const ICONO: Record<TipoPrueba, NombreIcono> = { archivo: 'archivo', enlace: 'enlace', video: 'video' };

interface Visor {
  url?: string | null;
  video?: { playback_id: string; video: string | null; miniatura: string | null } | null;
  estado?: string;
}

/** Reproduce un video de Mux (privado con token o público). hls.js se descarga solo si el navegador lo necesita. */
export function ReproductorMux({ playbackId, token, miniatura }: { playbackId: string; token?: string | null; miniatura?: string | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const fuente = `https://stream.mux.com/${playbackId}.m3u8${token ? `?token=${token}` : ''}`;
    let destruir: (() => void) | null = null;
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = fuente;
    } else {
      void import('hls.js').then(({ default: Hls }) => {
        if (!Hls.isSupported()) return setError(true);
        const hls = new Hls();
        hls.loadSource(fuente);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_, d) => d.fatal && setError(true));
        destruir = () => hls.destroy();
      });
    }
    return () => destruir?.();
  }, [playbackId, token]);
  const poster = `https://image.mux.com/${playbackId}/thumbnail.jpg${miniatura ? `?token=${miniatura}` : ''}`;
  return error ? (
    <Aviso tipo="aviso">No se pudo reproducir el video en este navegador.</Aviso>
  ) : (
    <video ref={ref} className="video-prueba" controls playsInline preload="none" poster={poster} />
  );
}

/** Sube un video directo a Mux y espera a que esté listo para usarlo como prueba (o en el portafolio). */
export async function subirVideo(archivo: File, uso: 'prueba' | 'portafolio', alAvanzar: (texto: string) => void): Promise<string> {
  const { video_id, url_subida } = await api<{ video_id: string; url_subida: string }>('/videos/subida', { cuerpo: { uso } });
  alAvanzar('Subiendo el video…');
  const r = await fetch(url_subida, { method: 'PUT', body: archivo, headers: { 'Content-Type': archivo.type || 'application/octet-stream' } });
  if (!r.ok) throw new Error('No se pudo subir el video');
  alAvanzar('Procesando el video…');
  for (let i = 0; i < 120; i++) {
    const v = await api<{ estado: string }>(`/videos/${video_id}`);
    if (v.estado === 'listo' || v.estado === 'procesando') return video_id;
    if (v.estado === 'error') throw new Error('El video no se pudo procesar (¿es muy largo?)');
    await new Promise((listo) => setTimeout(listo, 2000));
  }
  return video_id;
}

/**
 * Pruebas de una fase: lo que subió el proveedor en cada entrega y lo que suben las partes en una disputa.
 * Cada prueba muestra su huella (SHA-256): la de la entrega quedó en el contrato.
 */
export function Pruebas({
  pedidoId,
  fase,
  pruebas,
  puedeSubir,
  para,
  usuarioId,
  onCambio,
}: {
  pedidoId: string;
  fase: number;
  pruebas: PruebaDeFase[];
  puedeSubir: boolean;
  para: 'entrega' | 'disputa';
  usuarioId: string;
  onCambio: () => void;
}) {
  const { avisar } = useEstado();
  const [visor, setVisor] = useState<Record<string, Visor>>({});
  const [tipo, setTipo] = useState<TipoPrueba>('archivo');
  const [titulo, setTitulo] = useState('');
  const [url, setUrl] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const r = reglasDe(obtenerConfig().red).archivos;
  const tipos: TipoPrueba[] = servicios().videos ? ['archivo', 'enlace', 'video'] : ['archivo', 'enlace'];

  const ver = async (p: PruebaDeFase) => {
    try {
      const v = await api<Visor>(`/pruebas/${p.id}`);
      if (v.url && p.tipo !== 'video') window.open(v.url, '_blank', 'noopener');
      else setVisor((x) => ({ ...x, [p.id]: v }));
    } catch (e) {
      avisar(mensajeDeError(e), 'error');
    }
  };

  const agregar = async () => {
    setError(null);
    setOcupado(true);
    const id = avisar('Guardando la prueba…', 'cargando');
    try {
      const cuerpo: Record<string, unknown> = { fase, tipo, titulo: titulo.trim() || (archivo?.name ?? url).slice(0, 120), para };
      if (tipo === 'enlace') cuerpo.url = url.trim();
      if (tipo === 'archivo') {
        if (!archivo) throw new Error('Elige un archivo');
        if (!r.pruebaTipos.includes(archivo.type)) throw new Error('Ese tipo de archivo no se acepta (imágenes, PDF, ZIP, texto o audio)');
        if (archivo.size > r.pruebaMaxBytes) throw new Error(`El archivo puede pesar hasta ${Math.round(r.pruebaMaxBytes / 1048576)} MB`);
        const s = await api<{ ruta: string; token: string }>(`/pedidos/${pedidoId}/pruebas/subida`, { cuerpo: { fase, tipo: archivo.type, tamano: archivo.size } });
        const { error: e } = await supabase().storage.from('pruebas').uploadToSignedUrl(s.ruta, s.token, archivo, { contentType: archivo.type });
        if (e) throw new Error('No se pudo subir el archivo');
        cuerpo.ruta = s.ruta;
      }
      if (tipo === 'video') {
        if (!archivo) throw new Error('Elige un video');
        cuerpo.video_id = await subirVideo(archivo, 'prueba', (t) => avisar(t, 'cargando', id));
      }
      await api(`/pedidos/${pedidoId}/pruebas`, { cuerpo });
      avisar('Prueba guardada', 'exito', id);
      setTitulo('');
      setUrl('');
      setArchivo(null);
      onCambio();
    } catch (e) {
      avisar('No se pudo guardar la prueba', 'error', id);
      setError(mensajeDeError(e));
    } finally {
      setOcupado(false);
    }
  };

  const propias = pruebas.filter((p) => p.para === para);
  return (
    <div className="pila-compacta">
      {propias.length === 0 && <p className="tenue pequeno">{para === 'entrega' ? 'Todavía no hay pruebas de esta fase.' : 'Nadie subió pruebas para la disputa.'}</p>}
      <ul className="lista-pruebas">
        {propias.map((p) => (
          <li key={p.id} className="prueba">
            <span className="fila espaciada">
              <span className="fila">
                <Icono nombre={ICONO[p.tipo]} tamano={16} />
                <strong>{p.titulo}</strong>
              </span>
              <span className="fila">
                {p.sellada_en && <span className="badge badge-exito">En el contrato</span>}
                {para === 'entrega' && <span className="tenue pequeno">Entrega {p.entrega}</span>}
              </span>
            </span>
            <span className="tenue pequeno huella" title={p.huella}>
              {NOMBRE_PRUEBA[p.tipo]} · {fechaCorta(p.creada_en)} · huella {p.huella.slice(0, 12)}…
            </span>
            <span className="fila">
              <button type="button" className="boton boton-mini" onClick={() => ver(p)}>
                Ver
              </button>
              {p.autor_id === usuarioId && !p.sellada_en && (
                <button
                  type="button"
                  className="boton boton-mini"
                  onClick={async () => {
                    await api(`/pruebas/${p.id}`, { metodo: 'DELETE' });
                    onCambio();
                  }}
                >
                  Quitar
                </button>
              )}
            </span>
            {visor[p.id]?.video && <ReproductorMux playbackId={visor[p.id].video!.playback_id} token={visor[p.id].video!.video} miniatura={visor[p.id].video!.miniatura} />}
            {visor[p.id] && !visor[p.id].video && p.tipo === 'video' && <span className="tenue pequeno">El video todavía se está procesando.</span>}
          </li>
        ))}
      </ul>
      {puedeSubir && (
        <div className="caja pila-compacta">
          <strong className="pequeno">{para === 'entrega' ? 'Agregar una prueba de esta fase' : 'Agregar una prueba para la disputa'}</strong>
          <div className="pestanas" role="tablist" aria-label="Tipo de prueba">
            {tipos.map((t) => (
              <button key={t} type="button" role="tab" aria-selected={t === tipo} className={t === tipo ? 'activa' : ''} onClick={() => setTipo(t)}>
                {NOMBRE_PRUEBA[t]}
              </button>
            ))}
          </div>
          <input className="campo" maxLength={120} placeholder="Título (por ejemplo: Boceto del logo)" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          {tipo === 'enlace' ? (
            <input className="campo" type="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
          ) : (
            <input
              type="file"
              className="campo-archivo"
              accept={tipo === 'video' ? 'video/*' : r.pruebaTipos.join(',')}
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            />
          )}
          <span className="tenue pequeno">
            {tipo === 'video'
              ? `Hasta ${Math.round(r.videoPruebaMaxSeg / 60)} minutos. Es privado: lo ven solo las partes y el árbitro.`
              : tipo === 'archivo'
                ? `Hasta ${Math.round(r.pruebaMaxBytes / 1048576)} MB: imágenes, PDF, ZIP, texto o audio. Es privado.`
                : 'Solo enlaces https.'}
          </span>
          <button type="button" className="boton" disabled={ocupado || (tipo === 'enlace' ? !url.trim() : !archivo)} onClick={agregar}>
            <Icono nombre="subir" /> {ocupado ? 'Guardando…' : 'Agregar prueba'}
          </button>
          {error && <Aviso tipo="peligro">{error}</Aviso>}
        </div>
      )}
    </div>
  );
}
