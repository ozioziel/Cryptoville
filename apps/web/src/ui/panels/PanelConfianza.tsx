import { useCallback, useEffect, useState } from 'react';
import { useSesion } from '../../features/auth/sesion';
import { activarPush, desactivarPush, pushActivo, pushDisponible } from '../../features/notificaciones/push';
import { api, mensajeDeError } from '../../lib/api';
import { servicios } from '../../lib/config';
import { supabase } from '../../lib/supabase';
import { useEstado } from '../estado';
import { Aviso, Cargando } from '../components/basicos';
import { BotonBloquear, Verificado, type TipoReporte } from '../components/Confianza';

const MOTIVOS = [
  { id: 'estafa', nombre: 'Estafa o engaño' },
  { id: 'ofensivo', nombre: 'Ofensivo o acoso' },
  { id: 'spam', nombre: 'Spam' },
  { id: 'ilegal', nombre: 'Algo ilegal' },
  { id: 'suplantacion', nombre: 'Se hace pasar por otra persona' },
  { id: 'derechos', nombre: 'Usa trabajo ajeno sin permiso' },
  { id: 'otro', nombre: 'Otra cosa' },
] as const;

const QUE: Record<TipoReporte, string> = {
  local: 'este local',
  foto: 'esta foto',
  busqueda: 'este «Se busca»',
  resena: 'esta reseña',
  mensaje: 'este mensaje',
  persona: 'a esta persona',
  proyecto: 'este proyecto',
  chat: 'este mensaje',
};

/** Reportar contenido o a una persona. El equipo lo revisa. */
export function PanelReportar({ reporte, objetoId, nombre }: { reporte: TipoReporte; objetoId: string; nombre: string }) {
  const { avisar, atras } = useEstado();
  const [motivo, setMotivo] = useState<string>('estafa');
  const [detalle, setDetalle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  return (
    <div className="pila">
      <p>
        Vas a reportar {QUE[reporte]}: <strong>{nombre}</strong>. El equipo de WorkVille lo revisa y puede ocultarlo o suspender la cuenta.
      </p>
      <fieldset className="opciones-motivo">
        <legend className="etiqueta">¿Qué pasa?</legend>
        {MOTIVOS.map((m) => (
          <label key={m.id} className="casilla casilla-fila">
            <input type="radio" name="motivo" checked={motivo === m.id} onChange={() => setMotivo(m.id)} />
            <span>{m.nombre}</span>
          </label>
        ))}
      </fieldset>
      <textarea className="campo" rows={3} maxLength={1000} placeholder="Cuéntanos más (opcional)" value={detalle} onChange={(e) => setDetalle(e.target.value)} />
      <button
        type="button"
        className="boton boton-peligro"
        disabled={enviando}
        onClick={async () => {
          setError(null);
          setEnviando(true);
          try {
            await api('/reportes', { cuerpo: { tipo: reporte, objeto_id: objetoId, motivo, detalle } });
            avisar('Gracias por avisar: el equipo lo va a revisar.', 'exito');
            atras();
          } catch (e) {
            setError(mensajeDeError(e));
          } finally {
            setEnviando(false);
          }
        }}
      >
        {enviando ? 'Enviando…' : 'Enviar reporte'}
      </button>
      {error && <Aviso tipo="peligro">{error}</Aviso>}
    </div>
  );
}

/** Verificar mi identidad (KYC con Didit). Solo aparece si el servidor lo tiene encendido. */
export function SeccionVerificacion() {
  const { usuario } = useSesion();
  const { avisar } = useEstado();
  const [estado, setEstado] = useState<string | null | undefined>(undefined);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    if (!servicios().kyc || !usuario) return;
    api<{ estado: string | null }>('/kyc/estado').then((e) => setEstado(e.estado), () => setEstado(null));
  }, [usuario]);
  if (!usuario || !servicios().kyc) return null;
  if (usuario.verificado) {
    return (
      <div className="caja caja-exito fila">
        <Verificado si tamano={18} /> <span>Verificaste tu identidad: tu nombre lleva la insignia.</span>
      </div>
    );
  }
  const texto: Record<string, string> = {
    pendiente: 'Empezaste la verificación pero todavía no termina.',
    en_revision: 'Tu verificación está en revisión. Te avisamos cuando termine.',
    rechazada: 'Tu verificación no se aprobó. Puedes intentarlo de nuevo.',
    duplicada: 'Ese documento ya verificó otra cuenta. Cada persona puede tener una sola cuenta (con varias wallets).',
  };
  return (
    <section className="caja pila" aria-label="Verificar mi identidad">
      <strong>Verificar mi identidad</strong>
      <p className="pequeno">
        Hace falta para abrir un local, cobrar y dejar reseñas. Le muestras tu documento y tu cara a nuestro proveedor (Didit); WorkVille no
        guarda tus fotos ni tu número de documento.
      </p>
      {estado === undefined ? <Cargando /> : estado && <p className="tenue pequeno">{texto[estado] ?? ''}</p>}
      {estado !== 'duplicada' && estado !== 'en_revision' && (
        <button
          type="button"
          className="boton boton-primario"
          disabled={ocupado}
          onClick={async () => {
            setOcupado(true);
            try {
              const { url } = await api<{ url: string }>('/kyc/sesion', { cuerpo: {} });
              window.location.href = url;
            } catch (e) {
              avisar(mensajeDeError(e), 'error');
              setOcupado(false);
            }
          }}
        >
          {ocupado ? 'Abriendo…' : 'Verificarme'}
        </button>
      )}
    </section>
  );
}

interface Preferencias {
  correo: string | null;
  correo_verificado: boolean;
  por_correo: boolean;
  por_push: boolean;
}

/** Avisos fuera de la app (navegador y correo) y personas bloqueadas. */
export function PanelAvisosFuera() {
  const { usuario } = useSesion();
  const { avisar } = useEstado();
  const sv = servicios();
  const [pref, setPref] = useState<Preferencias | null>(null);
  const [correo, setCorreo] = useState('');
  const [push, setPush] = useState<boolean | null>(null);
  const [bloqueados, setBloqueados] = useState<{ id: string; nombre: string }[] | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    if (!usuario) return;
    const { data } = await supabase().from('preferencias_avisos').select('correo, correo_verificado, por_correo, por_push').eq('usuario_id', usuario.id).maybeSingle();
    const p = (data as Preferencias | null) ?? { correo: null, correo_verificado: false, por_correo: false, por_push: true };
    setPref(p);
    setCorreo(p.correo ?? '');
    const { data: b } = await supabase().from('bloqueos').select('bloqueado:usuarios!bloqueos_bloqueado_id_fkey(id, nombre)').eq('usuario_id', usuario.id);
    setBloqueados(((b ?? []) as unknown as { bloqueado: { id: string; nombre: string } }[]).map((x) => x.bloqueado));
  }, [usuario]);
  useEffect(() => {
    void cargar();
    void pushActivo().then(setPush, () => setPush(false));
  }, [cargar]);

  if (!usuario) return null;
  if (!pref) return <Cargando />;

  const guardar = async (cambios: Partial<Preferencias>, exito: string) => {
    setOcupado(true);
    try {
      const r = await api<{ correo_enviado: boolean; correo_disponible: boolean }>('/notificaciones/preferencias', { metodo: 'PUT', cuerpo: cambios });
      avisar(cambios.correo && !r.correo_disponible ? 'Guardamos tu correo; los correos se activan cuando el servidor tenga el servicio' : exito, 'exito');
      await cargar();
    } catch (e) {
      avisar(mensajeDeError(e), 'error');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="pila">
      <p className="tenue">
        Los plazos mueven dinero: si no respondes a tiempo, el contrato actúa solo. Activa los avisos para enterarte aunque no tengas WorkVille abierto.
      </p>
      <section className="caja pila">
        <strong>Notificaciones en este navegador</strong>
        {!sv.push_publica ? (
          <p className="tenue pequeno">Todavía no están disponibles en este servidor.</p>
        ) : !pushDisponible() ? (
          <p className="tenue pequeno">Tu navegador no permite notificaciones (en iPhone, primero agrega WorkVille a la pantalla de inicio).</p>
        ) : (
          <button
            type="button"
            className={push ? 'boton' : 'boton boton-primario'}
            disabled={ocupado || push === null}
            onClick={async () => {
              setOcupado(true);
              try {
                if (push) await desactivarPush();
                else await activarPush(sv.push_publica!);
                setPush(!push);
                avisar(push ? 'Notificaciones desactivadas en este navegador' : 'Listo: te avisaremos en este navegador', 'exito');
              } catch (e) {
                avisar(mensajeDeError(e), 'error');
              } finally {
                setOcupado(false);
              }
            }}
          >
            {push ? 'Desactivar notificaciones' : 'Activar notificaciones'}
          </button>
        )}
      </section>
      <section className="caja pila">
        <strong>Avisos por correo</strong>
        {!sv.correo && <p className="tenue pequeno">Los correos todavía no están disponibles en este servidor; puedes dejar tu correo guardado.</p>}
        <input className="campo" type="email" autoComplete="email" placeholder="tu@correo.com" value={correo} onChange={(e) => setCorreo(e.target.value)} />
        {pref.correo && !pref.correo_verificado && <p className="tenue pequeno">Te mandamos un enlace para confirmar ese correo.</p>}
        <div className="fila">
          <button
            type="button"
            className="boton"
            disabled={ocupado || correo.trim() === (pref.correo ?? '')}
            onClick={() => guardar({ correo: correo.trim() || null }, correo.trim() ? 'Te mandamos un enlace para confirmar tu correo' : 'Quitamos tu correo')}
          >
            Guardar correo
          </button>
          {pref.correo_verificado && (
            <label className="casilla casilla-fila">
              <input type="checkbox" checked={pref.por_correo} disabled={ocupado} onChange={(e) => guardar({ por_correo: e.target.checked }, 'Guardado')} />
              <span>Recibir avisos por correo</span>
            </label>
          )}
        </div>
      </section>
      <section className="pila">
        <strong>Personas bloqueadas</strong>
        {bloqueados?.length === 0 && <p className="tenue pequeno">No bloqueaste a nadie.</p>}
        <ul className="lista-simple">
          {bloqueados?.map((b) => (
            <li key={b.id} className="fila espaciada">
              <span>{b.nombre}</span>
              <BotonBloquear usuarioId={b.id} nombre={b.nombre} bloqueado />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
