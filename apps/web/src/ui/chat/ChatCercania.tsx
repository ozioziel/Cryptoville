import { reglasDe, type Barrio } from '@cryptoville/shared';
import { useEffect, useRef, useState } from 'react';
import { useSesion } from '../../features/auth/sesion';
import type { UsuarioPublico } from '../../features/services/datos';
import { emitir } from '../../game/EventBus';
import { api, mensajeDeError } from '../../lib/api';
import { obtenerConfig } from '../../lib/config';
import { supabase } from '../../lib/supabase';
import { useEstado, type MensajeCercania } from '../estado';
import { Avatar } from '../components/basicos';
import { BotonBloquear, BotonReportar, Nombre } from '../components/Confianza';
import { Icono } from '../components/Iconos';

interface LocalDeLaPersona {
  id: string;
  nombre: string;
  barrio: Barrio;
  lote: number;
}

/**
 * Ventanita del chat por cercanía (el globo aparece sobre la cabeza de quien escribe).
 * Arriba: el nombre con su insignia, «Visitar local», «Ver publicaciones», «Reportar» y «Bloquear».
 * Los mensajes se guardan 7 días, solo para revisar reportes.
 */
export function ChatCercania() {
  const { usuario } = useSesion();
  const { chatCon, cerrarChat, mensajeCercania, registrarMensaje, abrir, avisar } = useEstado();
  const [persona, setPersona] = useState<UsuarioPublico | null>(null);
  const [local, setLocal] = useState<LocalDeLaPersona | null>(null);
  const [mensajes, setMensajes] = useState<MensajeCercania[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const lista = useRef<HTMLOListElement>(null);
  const reglas = reglasDe(obtenerConfig().red).chatCercania;

  // Al abrir: quién es, su local principal y la conversación de los últimos días.
  useEffect(() => {
    setPersona(null);
    setLocal(null);
    setMensajes([]);
    setTexto('');
    if (!chatCon || !usuario) return;
    let activo = true;
    const desde = new Date(Date.now() - reglas.diasGuardado * 86_400_000).toISOString();
    void Promise.all([
      supabase().from('usuarios').select('id, nombre, avatar, apariencia, direccion, bio, rol, verificado').eq('id', chatCon).maybeSingle(),
      supabase().from('locales').select('id, nombre, barrio, lote').eq('usuario_id', chatCon).eq('activo', true).order('creado_en').limit(1),
      supabase()
        .from('mensajes_cercania')
        .select('id, de_id, para_id, texto, creado_en')
        .or(`and(de_id.eq.${usuario.id},para_id.eq.${chatCon}),and(de_id.eq.${chatCon},para_id.eq.${usuario.id})`)
        .gte('creado_en', desde)
        .order('creado_en')
        .limit(200),
    ]).then(([p, l, m]) => {
      if (!activo) return;
      setPersona((p.data as UsuarioPublico | null) ?? null);
      setLocal(((l.data ?? []) as LocalDeLaPersona[])[0] ?? null);
      setMensajes((m.data ?? []) as MensajeCercania[]);
    });
    return () => {
      activo = false;
    };
  }, [chatCon, usuario, reglas.diasGuardado]);

  // Mensajes nuevos de esta conversación (llegan por Realtime o los manda esta misma ventanita).
  useEffect(() => {
    const m = mensajeCercania;
    if (!m || !chatCon || !usuario) return;
    const deEsta = (m.de_id === chatCon && m.para_id === usuario.id) || (m.de_id === usuario.id && m.para_id === chatCon);
    if (deEsta) setMensajes((x) => (x.some((y) => y.id === m.id) ? x : [...x, m]));
  }, [mensajeCercania, chatCon, usuario]);

  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight });
  }, [mensajes]);

  if (!chatCon || !usuario) return null;

  const enviar = async () => {
    const limpio = texto.trim();
    if (!limpio) return;
    setEnviando(true);
    try {
      const m = await api<MensajeCercania>('/cercania/mensajes', { cuerpo: { para_id: chatCon, texto: limpio } });
      registrarMensaje(m);
      emitir('globo', usuario.id, limpio);
      setTexto('');
    } catch (e) {
      avisar(mensajeDeError(e), 'error');
    } finally {
      setEnviando(false);
    }
  };

  const nombre = persona?.nombre ?? '…';
  return (
    <section className="chat-cercania" aria-label={`Chat con ${nombre}`}>
      <header className="chat-cabecera">
        <span className="fila">
          {persona && <Avatar frame={persona.avatar} apariencia={persona.apariencia} tamano={30} titulo={persona.nombre} />}
          <Nombre nombre={nombre} verificado={persona?.verificado} fuerte />
        </span>
        <button type="button" className="boton-icono" onClick={cerrarChat} aria-label="Cerrar el chat">
          <Icono nombre="cerrar" tamano={16} />
        </button>
      </header>
      <nav className="chat-acciones" aria-label="Acciones">
        {local && (
          <button type="button" className="enlace" onClick={() => emitir('ir-a-local', { barrio: local.barrio, lote: local.lote })}>
            Visitar local
          </button>
        )}
        <button type="button" className="enlace" onClick={() => abrir({ tipo: 'portafolio', usuarioId: chatCon })}>
          Ver publicaciones
        </button>
        <BotonReportar tipo="chat" objetoId={chatCon} nombre={`la conversación con ${nombre}`} />
        <BotonBloquear usuarioId={chatCon} nombre={nombre} onCambio={(b) => b && cerrarChat()} />
      </nav>
      <ol className="chat-mensajes" ref={lista} aria-live="polite">
        {mensajes.length === 0 && <li className="tenue pequeno chat-vacio">Salúdale: le aparece un globo sobre tu cabeza.</li>}
        {mensajes.map((m) => (
          <li key={m.id} className={`chat-mensaje ${m.de_id === usuario.id ? 'propio' : ''}`}>
            {m.texto}
          </li>
        ))}
      </ol>
      <form
        className="chat-escribir"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
      >
        <input
          className="campo"
          maxLength={reglas.largoMaximo}
          placeholder={`Escribe a ${nombre}…`}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          aria-label="Mensaje"
          autoFocus
        />
        <button type="submit" className="boton boton-primario" disabled={enviando || !texto.trim()} aria-label="Enviar">
          <Icono nombre="flecha" />
        </button>
      </form>
      <p className="tenue chat-nota">Los mensajes se guardan {reglas.diasGuardado} días, solo para revisar reportes.</p>
    </section>
  );
}
