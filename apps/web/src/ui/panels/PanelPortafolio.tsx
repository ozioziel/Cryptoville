import { dominioDe, incrustarVideo, reglasDe, videoExterno, type EnlaceProyecto, type Experiencia, type Proyecto, type VideoProyecto } from '@cryptoville/shared';
import { useCallback, useEffect, useState } from 'react';
import { useSesion } from '../../features/auth/sesion';
import { cargarPortafolio, cargarProyecto, periodo, type Portafolio } from '../../features/portafolio/datos';
import type { UsuarioPublico } from '../../features/services/datos';
import { api, mensajeDeError } from '../../lib/api';
import { obtenerConfig, servicios } from '../../lib/config';
import { supabase } from '../../lib/supabase';
import { useEstado } from '../estado';
import { Aviso, Avatar, Cargando } from '../components/basicos';
import { BotonReportar, Nombre } from '../components/Confianza';
import { Icono } from '../components/Iconos';
import { ReproductorMux, subirVideo } from '../pagos/Pruebas';

const TAMANO_FOTO = 2 * 1024 * 1024;

async function cargarPersona(id: string): Promise<UsuarioPublico | null> {
  const { data } = await supabase().from('usuarios').select('id, nombre, avatar, apariencia, direccion, bio, rol, verificado').eq('id', id).maybeSingle();
  return (data as UsuarioPublico | null) ?? null;
}

/** Un enlace externo: muestra el dominio y no le pasa reputación al sitio (rel="nofollow ugc noopener"). */
export function EnlaceExterno({ enlace }: { enlace: EnlaceProyecto }) {
  return (
    <a className="enlace-externo" href={enlace.url} target="_blank" rel="nofollow ugc noopener noreferrer">
      <Icono nombre="enlace" tamano={14} /> {enlace.titulo || dominioDe(enlace.url)} <span className="tenue pequeno">· {dominioDe(enlace.url)}</span>
    </a>
  );
}

/** Video de un proyecto: Mux (público) o YouTube/Vimeo incrustado. */
function VideoDeProyecto({ video }: { video: VideoProyecto }) {
  const [playback, setPlayback] = useState(video.tipo === 'mux' ? video.playback_id : null);
  useEffect(() => {
    if (video.tipo !== 'mux' || playback) return;
    // Si se guardó mientras Mux lo procesaba, el id de reproducción está en la tabla de videos.
    void supabase()
      .from('videos')
      .select('playback_id')
      .eq('id', video.video_id)
      .maybeSingle()
      .then(({ data }) => setPlayback((data as { playback_id: string | null } | null)?.playback_id ?? null));
  }, [video, playback]);
  if (video.tipo === 'mux') {
    return playback ? <ReproductorMux playbackId={playback} /> : <p className="tenue pequeno">El video todavía se está procesando.</p>;
  }
  return (
    <div className="video-externo">
      <iframe
        src={incrustarVideo(video)}
        title={video.tipo === 'youtube' ? 'Video de YouTube' : 'Video de Vimeo'}
        loading="lazy"
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
      />
    </div>
  );
}

export function TarjetaProyecto({ proyecto: p, onAbrir, marcarPared = true }: { proyecto: Proyecto; onAbrir: () => void; marcarPared?: boolean }) {
  return (
    <button type="button" className="tarjeta-proyecto" onClick={onAbrir}>
      {p.fotos[0] ? <img src={p.fotos[0]} alt="" loading="lazy" /> : <span className="tarjeta-proyecto-vacia" aria-hidden="true"><Icono nombre="cuadro" tamano={28} /></span>}
      <span className="tarjeta-proyecto-texto">
        <b>{p.titulo}</b>
        {p.fecha && <span className="tenue pequeno">{new Date(`${p.fecha}T12:00:00`).toLocaleDateString('es', { month: 'short', year: 'numeric' })}</span>}
      </span>
      {marcarPared && p.destacado && <span className="badge badge-aviso">En la pared</span>}
    </button>
  );
}

/** El portafolio de una persona: su experiencia y sus proyectos (público). */
export function PanelPortafolio({ usuarioId }: { usuarioId: string }) {
  const { usuario } = useSesion();
  const { abrir } = useEstado();
  const [persona, setPersona] = useState<UsuarioPublico | null | undefined>(undefined);
  const [p, setP] = useState<Portafolio | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void cargarPersona(usuarioId).then(setPersona);
    cargarPortafolio(usuarioId).then(setP, (e) => setError(mensajeDeError(e)));
  }, [usuarioId]);

  if (error) return <Aviso tipo="peligro">{error}</Aviso>;
  if (persona === undefined || !p) return <Cargando />;
  if (!persona) return <p className="tenue">Este portafolio ya no está disponible.</p>;
  const esMio = usuario?.id === usuarioId;

  return (
    <div className="pila">
      <div className="fila">
        <Avatar frame={persona.avatar} apariencia={persona.apariencia} tamano={48} titulo={persona.nombre} />
        <span className="pila-compacta">
          <Nombre nombre={persona.nombre} verificado={persona.verificado} fuerte />
          {persona.bio && <span className="tenue pequeno">{persona.bio}</span>}
        </span>
      </div>
      {esMio && (
        <button type="button" className="boton" onClick={() => abrir({ tipo: 'mi-portafolio' })}>
          <Icono nombre="editar" /> Editar mi portafolio
        </button>
      )}

      <section className="pila-compacta">
        <h3>Proyectos</h3>
        {p.proyectos.length === 0 && <p className="tenue">Todavía no publicó proyectos.</p>}
        <div className="grilla-proyectos">
          {p.proyectos.map((x) => (
            <TarjetaProyecto key={x.id} proyecto={x} onAbrir={() => abrir({ tipo: 'proyecto', id: x.id })} />
          ))}
        </div>
      </section>

      <section className="pila-compacta">
        <h3>Experiencia</h3>
        {p.experiencias.length === 0 && <p className="tenue">Todavía no cargó su experiencia.</p>}
        <ul className="lista-simple">
          {p.experiencias.map((e) => (
            <li key={e.id} className="pila-compacta">
              <strong>
                {e.puesto} · {e.lugar}
              </strong>
              <span className="tenue pequeno">{periodo(e.desde, e.hasta)}</span>
              {e.descripcion && <p className="texto-largo pequeno">{e.descripcion}</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** Un proyecto del portafolio: fotos, descripción, enlaces y videos. */
export function PanelProyecto({ id }: { id: string }) {
  const { usuario } = useSesion();
  const { abrir } = useEstado();
  const [p, setP] = useState<Proyecto | null | undefined>(undefined);
  const [foto, setFoto] = useState(0);

  useEffect(() => {
    cargarProyecto(id).then(setP, () => setP(null));
  }, [id]);

  if (p === undefined) return <Cargando />;
  if (!p) return <p className="tenue">Este proyecto ya no está disponible.</p>;
  return (
    <div className="pila">
      {p.fotos.length > 0 && (
        <figure className="galeria">
          <img src={p.fotos[foto]} alt={`${p.titulo}, foto ${foto + 1} de ${p.fotos.length}`} className="foto-grande" />
          {p.fotos.length > 1 && (
            <div className="fila galeria-miniaturas" role="tablist" aria-label="Fotos">
              {p.fotos.map((f, i) => (
                <button key={f} type="button" role="tab" aria-selected={i === foto} className={i === foto ? 'activa' : ''} onClick={() => setFoto(i)}>
                  <img src={f} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </figure>
      )}
      <h3>{p.titulo}</h3>
      {p.fecha && <span className="tenue pequeno">{new Date(`${p.fecha}T12:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}</span>}
      <p className="texto-largo">{p.descripcion}</p>
      {p.videos.map((v, i) => (
        <VideoDeProyecto key={i} video={v} />
      ))}
      {p.enlaces.length > 0 && (
        <ul className="lista-simple">
          {p.enlaces.map((e) => (
            <li key={e.url}>
              <EnlaceExterno enlace={e} />
            </li>
          ))}
        </ul>
      )}
      <div className="fila">
        <button type="button" className="boton" onClick={() => abrir({ tipo: 'portafolio', usuarioId: p.usuario_id })}>
          Ver todo el portafolio
        </button>
        {usuario?.id !== p.usuario_id && <BotonReportar tipo="proyecto" objetoId={p.id} nombre={`«${p.titulo}»`} />}
      </div>
    </div>
  );
}

/** Editar mi portafolio: experiencia y proyectos. */
export function PanelMiPortafolio() {
  const { usuario } = useSesion();
  const { abrir, avisar } = useEstado();
  const [p, setP] = useState<Portafolio | null>(null);
  const [editando, setEditando] = useState<{ tipo: 'experiencia'; valor: Experiencia | null } | { tipo: 'proyecto'; valor: Proyecto | null } | null>(null);
  const r = reglasDe(obtenerConfig().red).portafolio;

  const cargar = useCallback(async () => {
    if (usuario) setP(await cargarPortafolio(usuario.id));
  }, [usuario]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (!usuario) return <p className="tenue">Entra para armar tu portafolio.</p>;
  if (!p) return <Cargando />;

  const listo = async (texto: string) => {
    setEditando(null);
    avisar(texto, 'exito');
    await cargar();
  };

  if (editando?.tipo === 'experiencia') return <FormularioExperiencia experiencia={editando.valor} onListo={listo} onCancelar={() => setEditando(null)} />;
  if (editando?.tipo === 'proyecto') return <FormularioProyecto proyecto={editando.valor} onListo={listo} onCancelar={() => setEditando(null)} />;

  return (
    <div className="pila">
      <p className="tenue pequeno">Tu portafolio se ve en tu perfil, en tus propuestas y como cuadros en la pared de tus locales (los proyectos destacados).</p>
      <button type="button" className="boton" onClick={() => abrir({ tipo: 'portafolio', usuarioId: usuario.id })}>
        Ver cómo lo ven los demás
      </button>

      <section className="pila-compacta">
        <h3>
          Proyectos ({p.proyectos.length}/{r.maxProyectos})
        </h3>
        <div className="grilla-proyectos">
          {p.proyectos.map((x) => (
            <TarjetaProyecto key={x.id} proyecto={x} onAbrir={() => setEditando({ tipo: 'proyecto', valor: x })} />
          ))}
        </div>
        {p.proyectos.length < r.maxProyectos && (
          <button type="button" className="boton" onClick={() => setEditando({ tipo: 'proyecto', valor: null })}>
            <Icono nombre="mas" /> Nuevo proyecto
          </button>
        )}
      </section>

      <section className="pila-compacta">
        <h3>
          Experiencia ({p.experiencias.length}/{r.maxExperiencias})
        </h3>
        <ul className="lista-tarjetas">
          {p.experiencias.map((e) => (
            <li key={e.id} className="servicio">
              <span className="servicio-texto">
                <b>
                  {e.puesto} · {e.lugar}
                </b>
                <span className="tenue pequeno">{periodo(e.desde, e.hasta)}</span>
              </span>
              <button type="button" className="boton boton-mini" onClick={() => setEditando({ tipo: 'experiencia', valor: e })}>
                <Icono nombre="editar" tamano={14} /> Editar
              </button>
            </li>
          ))}
        </ul>
        {p.experiencias.length < r.maxExperiencias && (
          <button type="button" className="boton" onClick={() => setEditando({ tipo: 'experiencia', valor: null })}>
            <Icono nombre="mas" /> Sumar experiencia
          </button>
        )}
      </section>
    </div>
  );
}

function FormularioExperiencia({ experiencia: e, onListo, onCancelar }: { experiencia: Experiencia | null; onListo: (t: string) => void; onCancelar: () => void }) {
  const [puesto, setPuesto] = useState(e?.puesto ?? '');
  const [lugar, setLugar] = useState(e?.lugar ?? '');
  const [desde, setDesde] = useState(e?.desde ?? '');
  const [hasta, setHasta] = useState(e?.hasta ?? '');
  const [descripcion, setDescripcion] = useState(e?.descripcion ?? '');
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    setError(null);
    try {
      const cuerpo = { puesto, lugar, desde, hasta: hasta || null, descripcion };
      if (e) await api(`/portafolio/experiencias/${e.id}`, { metodo: 'PUT', cuerpo });
      else await api('/portafolio/experiencias', { cuerpo });
      onListo(e ? 'Experiencia actualizada' : 'Experiencia guardada');
    } catch (err) {
      setError(mensajeDeError(err));
    }
  };

  return (
    <div className="pila">
      <label className="etiqueta">
        Puesto
        <input className="campo" maxLength={80} placeholder="Diseñadora gráfica" value={puesto} onChange={(x) => setPuesto(x.target.value)} />
      </label>
      <label className="etiqueta">
        Dónde
        <input className="campo" maxLength={80} placeholder="Estudio, empresa o por mi cuenta" value={lugar} onChange={(x) => setLugar(x.target.value)} />
      </label>
      <div className="fila">
        <label className="etiqueta">
          Desde
          <input className="campo" type="date" value={desde} onChange={(x) => setDesde(x.target.value)} />
        </label>
        <label className="etiqueta">
          Hasta (vacío si sigues ahí)
          <input className="campo" type="date" value={hasta} onChange={(x) => setHasta(x.target.value)} />
        </label>
      </div>
      <label className="etiqueta">
        Qué hacías
        <textarea className="campo" rows={3} maxLength={600} value={descripcion} onChange={(x) => setDescripcion(x.target.value)} />
      </label>
      <div className="fila">
        <button type="button" className="boton boton-primario" disabled={puesto.trim().length < 2 || lugar.trim().length < 2 || !desde} onClick={guardar}>
          Guardar
        </button>
        {e && (
          <button
            type="button"
            className="boton boton-peligro"
            onClick={async () => {
              try {
                await api(`/portafolio/experiencias/${e.id}`, { metodo: 'DELETE' });
                onListo('Experiencia borrada');
              } catch (err) {
                setError(mensajeDeError(err));
              }
            }}
          >
            Borrar
          </button>
        )}
        <button type="button" className="boton" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
      {error && <Aviso tipo="peligro">{error}</Aviso>}
    </div>
  );
}

/** Lo que se manda a la API por cada video: Mux (id del video subido) o un enlace de YouTube/Vimeo. */
type VideoEditado = { tipo: 'mux'; video_id: string } | { tipo: 'youtube' | 'vimeo'; url: string };

function FormularioProyecto({ proyecto: p, onListo, onCancelar }: { proyecto: Proyecto | null; onListo: (t: string) => void; onCancelar: () => void }) {
  const { avisar } = useEstado();
  const reglas = reglasDe(obtenerConfig().red);
  const r = reglas.portafolio;
  const [titulo, setTitulo] = useState(p?.titulo ?? '');
  const [descripcion, setDescripcion] = useState(p?.descripcion ?? '');
  const [fecha, setFecha] = useState(p?.fecha ?? '');
  const [fotos, setFotos] = useState<string[]>(p?.fotos ?? []);
  const [enlaces, setEnlaces] = useState<EnlaceProyecto[]>(p?.enlaces ?? []);
  const [videos, setVideos] = useState<VideoEditado[]>(() =>
    (p?.videos ?? []).map((v) => (v.tipo === 'mux' ? { tipo: 'mux', video_id: v.video_id } : { tipo: v.tipo, url: v.url })),
  );
  const [destacado, setDestacado] = useState(p?.destacado ?? false);
  const [nuevoEnlace, setNuevoEnlace] = useState('');
  const [nuevoVideo, setNuevoVideo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const medios = fotos.length + videos.length;

  const subirFoto = async (archivo: File) => {
    setError(null);
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(archivo.type)) return setError('Solo imágenes PNG, JPG o WEBP');
    if (archivo.size > TAMANO_FOTO) return setError('Cada foto puede pesar hasta 2 MB');
    setOcupado(true);
    try {
      const s = await api<{ ruta: string; token: string; url_publica: string }>('/uploads/foto', { cuerpo: { tipo: archivo.type, tamano: archivo.size } });
      const { error: e } = await supabase().storage.from('fotos').uploadToSignedUrl(s.ruta, s.token, archivo, { contentType: archivo.type });
      if (e) throw new Error('No se pudo subir la foto');
      setFotos((f) => [...f, s.url_publica]);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setOcupado(false);
    }
  };

  const subirMux = async (archivo: File) => {
    setError(null);
    setOcupado(true);
    const id = avisar('Subiendo el video…', 'cargando');
    try {
      const videoId = await subirVideo(archivo, 'portafolio', (t) => avisar(t, 'cargando', id));
      setVideos((v) => [...v, { tipo: 'mux', video_id: videoId }]);
      avisar('Video listo', 'exito', id);
    } catch (e) {
      avisar('No se pudo subir el video', 'error', id);
      setError(mensajeDeError(e));
    } finally {
      setOcupado(false);
    }
  };

  const sumarEnlace = () => {
    const url = nuevoEnlace.trim();
    if (!/^https:\/\/\S+\.\S+/.test(url)) return setError('Los enlaces tienen que empezar con https://');
    setEnlaces((e) => [...e, { url }]);
    setNuevoEnlace('');
    setError(null);
  };

  const sumarVideo = () => {
    const v = videoExterno(nuevoVideo, reglas);
    if (!v) return setError('Ese enlace no se puede mostrar: usa un video de YouTube o Vimeo (https)');
    setVideos((x) => [...x, { tipo: v.tipo, url: v.url }]);
    setNuevoVideo('');
    setError(null);
  };

  const guardar = async () => {
    setError(null);
    setOcupado(true);
    try {
      const cuerpo = { titulo, descripcion, fecha: fecha || null, fotos, enlaces, videos, destacado };
      if (p) await api(`/portafolio/proyectos/${p.id}`, { metodo: 'PUT', cuerpo });
      else await api('/portafolio/proyectos', { cuerpo });
      onListo(p ? 'Proyecto actualizado' : 'Proyecto publicado');
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="pila">
      <label className="etiqueta">
        Título
        <input className="campo" maxLength={80} placeholder="Identidad para una cafetería" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      </label>
      <label className="etiqueta">
        De qué se trata
        <textarea className="campo" rows={4} maxLength={2000} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      </label>
      <label className="etiqueta">
        Fecha (opcional)
        <input className="campo" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </label>

      <span className="etiqueta">
        Fotos y videos ({medios}/{r.maxMediosPorProyecto})
      </span>
      {fotos.length > 0 && (
        <div className="fila galeria-miniaturas">
          {fotos.map((f) => (
            <span key={f} className="miniatura-editable">
              <img src={f} alt="" />
              <button type="button" className="boton-icono" aria-label="Quitar foto" onClick={() => setFotos((x) => x.filter((y) => y !== f))}>
                <Icono nombre="cerrar" tamano={14} />
              </button>
            </span>
          ))}
        </div>
      )}
      {medios < r.maxMediosPorProyecto && (
        <label className="etiqueta">
          Sumar una foto (hasta 2 MB)
          <input type="file" className="campo-archivo" accept="image/png,image/jpeg,image/webp" disabled={ocupado} onChange={(e) => e.target.files?.[0] && subirFoto(e.target.files[0])} />
        </label>
      )}
      {videos.length > 0 && (
        <ul className="lista-simple">
          {videos.map((v, i) => (
            <li key={i} className="fila espaciada">
              <span className="fila pequeno">
                <Icono nombre="video" tamano={14} /> {v.tipo === 'mux' ? 'Video subido a WorkVille' : dominioDe(v.url)}
              </span>
              <button type="button" className="boton boton-mini" onClick={() => setVideos((x) => x.filter((_, j) => j !== i))}>
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
      {medios < r.maxMediosPorProyecto && (
        <div className="fila">
          <input className="campo" placeholder="Enlace de YouTube o Vimeo" value={nuevoVideo} onChange={(e) => setNuevoVideo(e.target.value)} />
          <button type="button" className="boton" disabled={!nuevoVideo.trim()} onClick={sumarVideo}>
            Sumar video
          </button>
        </div>
      )}
      {servicios().videos && medios < r.maxMediosPorProyecto && (
        <label className="etiqueta">
          O sube un video (hasta {Math.round(reglas.archivos.videoPortafolioMaxSeg / 60)} minutos)
          <input type="file" className="campo-archivo" accept="video/*" disabled={ocupado} onChange={(e) => e.target.files?.[0] && subirMux(e.target.files[0])} />
        </label>
      )}

      <span className="etiqueta">Enlaces</span>
      {enlaces.length > 0 && (
        <ul className="lista-simple">
          {enlaces.map((e) => (
            <li key={e.url} className="fila espaciada">
              <EnlaceExterno enlace={e} />
              <button type="button" className="boton boton-mini" onClick={() => setEnlaces((x) => x.filter((y) => y.url !== e.url))}>
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
      {enlaces.length < 8 && (
        <div className="fila">
          <input className="campo" type="url" placeholder="https://…" value={nuevoEnlace} onChange={(e) => setNuevoEnlace(e.target.value)} />
          <button type="button" className="boton" disabled={!nuevoEnlace.trim()} onClick={sumarEnlace}>
            Sumar enlace
          </button>
        </div>
      )}

      <label className="fila pequeno">
        <input type="checkbox" checked={destacado} onChange={(e) => setDestacado(e.target.checked)} />
        Colgarlo como cuadro en la pared de mis locales (hasta {r.maxDestacados})
      </label>

      <div className="fila">
        <button type="button" className="boton boton-primario" disabled={ocupado || titulo.trim().length < 3 || descripcion.trim().length < 10} onClick={guardar}>
          {ocupado ? 'Guardando…' : 'Guardar'}
        </button>
        {p && (
          <button
            type="button"
            className="boton boton-peligro"
            disabled={ocupado}
            onClick={async () => {
              try {
                await api(`/portafolio/proyectos/${p.id}`, { metodo: 'DELETE' });
                onListo('Proyecto borrado');
              } catch (e) {
                setError(mensajeDeError(e));
              }
            }}
          >
            Borrar
          </button>
        )}
        <button type="button" className="boton" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
      {error && <Aviso tipo="peligro">{error}</Aviso>}
    </div>
  );
}
