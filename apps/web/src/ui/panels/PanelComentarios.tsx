import type { Comentario, TipoComentario } from '@cryptoville/shared';
import { useEffect, useState } from 'react';
import { useSesion } from '../../features/auth/sesion';
import { api, mensajeDeError } from '../../lib/api';
import { reglas } from '../../lib/config';
import { supabase } from '../../lib/supabase';
import { useEstado } from '../estado';
import { Aviso, Cargando, fechaCorta } from '../components/basicos';
import { Pestanas } from '../components/Editor';

const TIPOS: readonly { id: TipoComentario; nombre: string }[] = [
  { id: 'idea', nombre: 'Una idea' },
  { id: 'error', nombre: 'Algo falló' },
  { id: 'otro', nombre: 'Otra cosa' },
];

/** «Enviar comentarios»: una idea o un error para el equipo, con captura opcional. */
export function PanelComentarios() {
  const { usuario } = useSesion();
  const { villa, modo, avisar, cerrar, abrir } = useEstado();
  const [tipo, setTipo] = useState<TipoComentario>('idea');
  const [texto, setTexto] = useState('');
  const [captura, setCaptura] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (!usuario) {
    return (
      <div className="pila">
        <p>Para mandarnos un comentario, primero entra a Cryptoville (así podemos responderte).</p>
        <button type="button" className="boton boton-primario" onClick={() => abrir({ tipo: 'bienvenida' })}>
          Entrar
        </button>
      </div>
    );
  }

  const enviar = async () => {
    setError(null);
    setEnviando(true);
    const cargando = avisar('Enviando tu comentario…', 'cargando');
    try {
      let captura_ruta: string | undefined;
      if (captura) {
        if (captura.size > reglas().archivos.capturaMaxBytes) throw new Error('La captura puede pesar hasta 2 MB');
        const s = await api<{ ruta: string; token: string }>('/comentarios/captura', { cuerpo: { tipo: captura.type, tamano: captura.size } });
        const { error: e } = await supabase().storage.from('capturas').uploadToSignedUrl(s.ruta, s.token, captura, { contentType: captura.type });
        if (e) throw new Error('No se pudo subir la captura');
        captura_ruta = s.ruta;
      }
      const contexto = `Villa ${villa} · modo ${modo} · ${navigator.userAgent.slice(0, 200)}`;
      await api('/comentarios', { cuerpo: { tipo, texto, contexto, captura_ruta } });
      avisar('¡Gracias! Tu comentario le llegó al equipo.', 'exito', cargando);
      cerrar();
    } catch (e) {
      avisar('No se pudo enviar tu comentario', 'error', cargando);
      setError(mensajeDeError(e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="pila">
      <p className="tenue">Cuéntanos qué mejorarías o qué falló. Lo lee el equipo de Cryptoville.</p>
      <Pestanas etiqueta="Tipo de comentario" opciones={TIPOS} valor={tipo} onCambiar={setTipo} />
      <textarea
        className="campo"
        rows={5}
        maxLength={2000}
        placeholder={tipo === 'error' ? '¿Qué estabas haciendo y qué pasó?' : 'Tu idea…'}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
      />
      <label className="etiqueta">
        Captura de pantalla (opcional, hasta 2 MB)
        <input
          type="file"
          className="campo-archivo"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => setCaptura(e.target.files?.[0] ?? null)}
        />
      </label>
      <button type="button" className="boton boton-primario" disabled={enviando || texto.trim().length < 5} onClick={enviar}>
        {enviando ? 'Enviando…' : 'Enviar comentario'}
      </button>
      {error && <Aviso tipo="peligro">{error}</Aviso>}
    </div>
  );
}

interface ComentarioEquipo extends Comentario {
  usuario: { id: string; nombre: string } | null;
  captura_url: string | null;
}

/** Panel del equipo: comentarios recibidos. */
export function PanelComentariosEquipo() {
  const [lista, setLista] = useState<ComentarioEquipo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cargar = () => api<ComentarioEquipo[]>('/arbitro/comentarios').then(setLista, (e) => setError(mensajeDeError(e)));
  useEffect(() => {
    void cargar();
  }, []);
  if (error) return <Aviso tipo="peligro">{error}</Aviso>;
  if (!lista) return <Cargando />;
  if (!lista.length) return <p className="tenue">Todavía no llegó ningún comentario.</p>;
  return (
    <ul className="lista-tarjetas">
      {lista.map((c) => (
        <li key={c.id} className={`tarjeta comentario-${c.estado}`}>
          <span className="fila espaciada">
            <strong>{TIPOS.find((t) => t.id === c.tipo)?.nombre ?? c.tipo}</strong>
            <span className="tenue pequeno">{fechaCorta(c.creado_en)}</span>
          </span>
          <p className="texto-largo">{c.texto}</p>
          <span className="tenue pequeno">
            {c.usuario?.nombre ?? 'Sin nombre'} · {c.contexto}
          </span>
          {c.captura_url && (
            <a href={c.captura_url} target="_blank" rel="noreferrer noopener">
              Ver captura
            </a>
          )}
          <div className="fila">
            {(['visto', 'resuelto'] as const).map((estado) => (
              <button
                key={estado}
                type="button"
                className="boton boton-mini"
                disabled={c.estado === estado}
                onClick={async () => {
                  await api(`/arbitro/comentarios/${c.id}`, { metodo: 'PATCH', cuerpo: { estado } });
                  await cargar();
                }}
              >
                {estado === 'visto' ? 'Marcar visto' : 'Resuelto'}
              </button>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
