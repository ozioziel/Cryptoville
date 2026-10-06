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
import { obtenerConfig } from '../../lib/config';
import { useEstado } from '../estado';
import { Aviso, Avatar, Direccion } from '../components/basicos';
import { SelectorPieza } from '../components/Editor';
import { Icono } from '../components/Iconos';

/** Partes que se muestran con una vista previa de la cara. */
const CON_VISTA: CampoPersona[] = ['peinado', 'barba', 'lentes', 'gorro'];

export function PanelPerfil() {
  const { usuario, salir, recargar, local } = useSesion();
  const { abrir, cerrar, recargarPueblo, notificar } = useEstado();
  const [nombre, setNombre] = useState(usuario?.nombre ?? '');
  const [bio, setBio] = useState(usuario?.bio ?? '');
  const [avatar, setAvatar] = useState(usuario?.avatar ?? 85);
  const [apariencia, setApariencia] = useState<AparienciaPersona>(() => aparienciaDeUsuario(usuario ?? { avatar: 85 }));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const config = obtenerConfig();
  if (!usuario) return null;

  const guardar = async () => {
    setError(null);
    setGuardando(true);
    try {
      await api('/yo', { metodo: 'PATCH', cuerpo: { nombre, bio, avatar, apariencia } });
      emitir('apariencia', apariencia);
      await recargar();
      await recargarPueblo();
      notificar('Perfil guardado');
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  };

  const cambiar = (campo: CampoPersona, valor: string) => setApariencia((a) => ({ ...a, [campo]: valor }));

  return (
    <div className="pila">
      <Direccion valor={usuario.direccion} />
      {usuario.rol === 'arbitro' && (
        <button type="button" className="boton" onClick={() => abrir({ tipo: 'arbitro' })}>
          <Icono nombre="balanza" /> Panel del árbitro
        </button>
      )}
      <label className="etiqueta" htmlFor="nombre">
        Nombre
      </label>
      <input id="nombre" className="campo" maxLength={40} value={nombre} onChange={(e) => setNombre(e.target.value)} />
      <label className="etiqueta" htmlFor="bio">
        Presentación
      </label>
      <textarea id="bio" className="campo" rows={3} maxLength={280} value={bio} onChange={(e) => setBio(e.target.value)} />

      <section className="editor" aria-label="Tu personaje">
        <div className="editor-vista">
          <Avatar frame={avatar} apariencia={apariencia} tamano={96} recorte="cuerpo" titulo="Vista previa de tu personaje" />
        </div>
        <span className="etiqueta">Tu personaje</span>
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
        {guardando ? 'Guardando…' : 'Guardar'}
      </button>
      {error && <Aviso tipo="peligro">{error}</Aviso>}
      <button type="button" className="boton" onClick={() => abrir({ tipo: 'mi-local' })}>
        {local ? 'Editar mi local' : 'Abrir mi local'}
      </button>
      {config.token_id && (
        <p className="tenue pequeno">
          Pagas con {config.asset || 'USDC de prueba'}. Para ver tu saldo en Freighter, agrega el token con su contrato{' '}
          <code>{config.token_id}</code>.
        </p>
      )}
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
