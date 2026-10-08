import {
  APARIENCIA_POR_AVATAR,
  AVATARES,
  CAMPOS_PERSONA,
  CATALOGO_PERSONA,
  aparienciaDeAvatar,
  aparienciaDeUsuario,
  type AparienciaPersona,
  type CampoPersona,
} from '@cryptoville/shared';
import { useMemo, useState } from 'react';
import { crearPersona } from '../../arte/persona';
import { useSesion } from '../../features/auth/sesion';
import { emitir } from '../../game/EventBus';
import { api, mensajeDeError } from '../../lib/api';
import { obtenerConfig, servicios } from '../../lib/config';
import { useEstado } from '../estado';
import { Aviso, Avatar, Direccion } from '../components/basicos';
import { SelectorPieza } from '../components/Editor';
import { Icono } from '../components/Iconos';
import { EnlacesLegales } from './PanelLegal';
import { SeccionVerificacion } from './PanelConfianza';
import { Nombre } from '../components/Confianza';
import { ubicacionLocal } from './PanelMisLocales';

/** Partes que se muestran con una vista previa de la cara. */
const CON_VISTA: CampoPersona[] = ['peinado', 'barba', 'lentes', 'gorro'];

export function PanelPerfil() {
  const { usuario, salir, recargar, locales } = useSesion();
  const { abrir, cerrar, recargarPueblo, notificar } = useEstado();
  const [nombre, setNombre] = useState(usuario?.nombre ?? '');
  const [bio, setBio] = useState(usuario?.bio ?? '');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const config = obtenerConfig();
  if (!usuario) return null;

  const guardar = async () => {
    setError(null);
    setGuardando(true);
    try {
      await api('/yo', { metodo: 'PATCH', cuerpo: { nombre, bio } });
      await recargar();
      await recargarPueblo();
      notificar('Perfil guardado');
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="pila">
      {usuario.suspendido && (
        <Aviso tipo="peligro">Tu cuenta está suspendida por un reporte. Puedes escribirle al equipo desde «Enviar comentarios».</Aviso>
      )}
      <div className="fila espaciada">
        <Nombre nombre={usuario.nombre} verificado={usuario.verificado} fuerte />
        <Direccion valor={usuario.direccion} />
      </div>
      <SeccionVerificacion />
      {usuario.rol === 'arbitro' && (
        <div className="fila">
          <button type="button" className="boton" onClick={() => abrir({ tipo: 'arbitro' })}>
            <Icono nombre="balanza" /> Panel del árbitro
          </button>
          <button type="button" className="boton" onClick={() => abrir({ tipo: 'comentarios-equipo' })}>
            <Icono nombre="chat" /> Comentarios recibidos
          </button>
        </div>
      )}
      <div className="fila">
        <button type="button" className="boton boton-primario" onClick={() => abrir({ tipo: 'personalizar' })}>
          <Icono nombre="pincel" /> Personalizar
        </button>
        <button type="button" className="boton" onClick={() => abrir({ tipo: 'mis-locales' })}>
          <Icono nombre="casa" /> {locales.length ? `Mis locales (${locales.length})` : 'Abrir mi local'}
        </button>
        <button type="button" className="boton" onClick={() => abrir({ tipo: 'mi-portafolio' })}>
          <Icono nombre="cuadro" /> Mi portafolio
        </button>
        <button type="button" className="boton" onClick={() => abrir({ tipo: 'wallets' })}>
          <Icono nombre="copiar" /> Mis wallets
        </button>
        {servicios().rampa && (
          <button type="button" className="boton" onClick={() => abrir({ tipo: 'retiro' })}>
            <Icono nombre="qr" /> Pasar a mi banco
          </button>
        )}
      </div>
      <label className="etiqueta" htmlFor="nombre">
        Nombre
      </label>
      <input id="nombre" className="campo" maxLength={40} value={nombre} onChange={(e) => setNombre(e.target.value)} />
      <label className="etiqueta" htmlFor="bio">
        Presentación
      </label>
      <textarea id="bio" className="campo" rows={3} maxLength={280} value={bio} onChange={(e) => setBio(e.target.value)} />
      <button type="button" className="boton boton-primario" disabled={guardando} onClick={guardar}>
        {guardando ? 'Guardando…' : 'Guardar'}
      </button>
      {error && <Aviso tipo="peligro">{error}</Aviso>}
      {config.token_id && (
        <p className="tenue pequeno">
          Pagas con {config.asset || 'USDC de prueba'}. Para ver tu saldo en Freighter, agrega el token con su contrato{' '}
          <code>{config.token_id}</code>.
        </p>
      )}
      <button type="button" className="boton" onClick={() => abrir({ tipo: 'avisos-config' })}>
        <Icono nombre="campana" /> Avisos y bloqueos
      </button>
      <button type="button" className="boton" onClick={() => abrir({ tipo: 'comentarios' })}>
        <Icono nombre="chat" /> Enviar comentarios
      </button>
      <button
        type="button"
        className="boton boton-peligro"
        onClick={async () => {
          await salir();
          cerrar();
        }}
      >
        <Icono nombre="salir" /> Cerrar sesión
      </button>
      <EnlacesLegales />
    </div>
  );
}

/** Perfil → Personalizar: elegir qué se edita, mi personaje o uno de mis locales (y cuál). */
export function PanelPersonalizar() {
  const { locales } = useSesion();
  const { abrir } = useEstado();
  const [eligiendoLocal, setEligiendoLocal] = useState(false);
  return (
    <div className="pila">
      <p className="tenue">¿Qué quieres personalizar?</p>
      <div className="opciones-grandes">
        <button type="button" className="opcion-grande" onClick={() => abrir({ tipo: 'personaje' })}>
          <Icono nombre="usuario" tamano={26} />
          <strong>Mi personaje</strong>
          <span className="tenue pequeno">Cara, peinado, ropa y colores</span>
        </button>
        <button type="button" className={`opcion-grande ${eligiendoLocal ? 'activa' : ''}`} aria-expanded={eligiendoLocal} onClick={() => setEligiendoLocal((v) => !v)}>
          <Icono nombre="casa" tamano={26} />
          <strong>Un local</strong>
          <span className="tenue pequeno">La casa por fuera y por dentro, y sus servicios</span>
        </button>
      </div>
      {eligiendoLocal && (
        <section className="pila-compacta" aria-label="¿Cuál local?">
          <span className="etiqueta">¿Cuál local?</span>
          {locales.length === 0 && <p className="tenue pequeno">Todavía no tienes locales.</p>}
          <ul className="lista-tarjetas">
            {locales.map((l) => (
              <li key={l.id}>
                <button type="button" className="servicio tarjeta-local" onClick={() => abrir({ tipo: 'mi-local', localId: l.id })}>
                  <span className="tarjeta-local-color" style={{ background: l.color }} aria-hidden="true" />
                  <span className="servicio-texto">
                    <b>{l.nombre}</b>
                    <span className="tenue pequeno">{ubicacionLocal(l)}</span>
                  </span>
                  <Icono nombre="flecha" tamano={16} />
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="boton" onClick={() => abrir({ tipo: 'mis-locales' })}>
            <Icono nombre="mas" /> {locales.length ? 'Abrir otro local' : 'Abrir mi local'}
          </button>
        </section>
      )}
    </div>
  );
}

/** El editor de mi personaje (la persona en vectores que camina por la villa). */
export function PanelPersonaje() {
  const { usuario, recargar } = useSesion();
  const { recargarPueblo, notificar } = useEstado();
  const [avatar, setAvatar] = useState(usuario?.avatar ?? 85);
  const [apariencia, setApariencia] = useState<AparienciaPersona>(() => aparienciaDeUsuario(usuario ?? { avatar: 85 }));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  if (!usuario) return null;

  const guardar = async () => {
    setError(null);
    setGuardando(true);
    try {
      await api('/yo', { metodo: 'PATCH', cuerpo: { avatar, apariencia } });
      emitir('apariencia', apariencia);
      await recargar();
      await recargarPueblo();
      notificar('Personaje guardado');
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  };

  const cambiar = (campo: CampoPersona, valor: string) => setApariencia((a) => ({ ...a, [campo]: valor }));

  return (
    <div className="pila">
      <section className="editor" aria-label="Tu personaje">
        <div className="editor-vista">
          <Avatar frame={avatar} apariencia={apariencia} tamano={96} recorte="cuerpo" titulo="Vista previa de tu personaje" />
        </div>
        <p className="tenue pequeno">Empieza por un personaje base y cambia lo que quieras: todas las piezas combinan entre sí.</p>
        <div className="selector-avatar" role="radiogroup" aria-label="Personaje base">
          {AVATARES.map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={a === avatar}
              aria-label={`Personaje base ${AVATARES.indexOf(a) + 1}`}
              className={a === avatar ? 'activo' : ''}
              onClick={() => {
                setAvatar(a);
                setApariencia(aparienciaDeAvatar(a));
              }}
            >
              <Avatar frame={a} apariencia={APARIENCIA_POR_AVATAR[a]} tamano={36} />
            </button>
          ))}
        </div>
        {CAMPOS_PERSONA.map(({ campo, nombre: etiqueta }) => (
          <SelectorPersona key={campo} campo={campo} etiqueta={etiqueta} apariencia={apariencia} onCambiar={cambiar} />
        ))}
      </section>
      <button type="button" className="boton boton-primario" disabled={guardando} onClick={guardar}>
        {guardando ? 'Guardando…' : 'Guardar mi personaje'}
      </button>
      {error && <Aviso tipo="peligro">{error}</Aviso>}
    </div>
  );
}

function SelectorPersona({
  campo,
  etiqueta,
  apariencia,
  onCambiar,
}: {
  campo: CampoPersona;
  etiqueta: string;
  apariencia: AparienciaPersona;
  onCambiar: (campo: CampoPersona, valor: string) => void;
}) {
  // Las caritas de vista previa solo se recalculan cuando cambia la apariencia.
  const vistas = useMemo(() => {
    if (!CON_VISTA.includes(campo)) return null;
    return new Map(CATALOGO_PERSONA[campo].map((o) => [o.id, crearPersona({ ...apariencia, [campo]: o.id }, { recorte: 'cabeza' })]));
  }, [campo, apariencia]);
  return (
    <SelectorPieza
      etiqueta={etiqueta}
      opciones={CATALOGO_PERSONA[campo]}
      valor={apariencia[campo]}
      onCambiar={(v) => onCambiar(campo, v)}
      vista={vistas ? (id) => <span className="opcion-vista" aria-hidden="true" dangerouslySetInnerHTML={{ __html: vistas.get(id) ?? '' }} /> : undefined}
    />
  );
}
