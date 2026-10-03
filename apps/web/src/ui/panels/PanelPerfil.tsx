import { AVATARES } from '@cryptoville/shared';
import { useState } from 'react';
import { useSesion } from '../../features/auth/sesion';
import { emitir } from '../../game/EventBus';
import { api, mensajeDeError } from '../../lib/api';
import { obtenerConfig } from '../../lib/config';
import { useEstado } from '../estado';
import { Aviso, Avatar, Direccion } from '../components/basicos';

export function PanelPerfil() {
  const { usuario, salir, recargar, local } = useSesion();
  const { abrir, cerrar, recargarPueblo, notificar } = useEstado();
  const [nombre, setNombre] = useState(usuario?.nombre ?? '');
  const [bio, setBio] = useState(usuario?.bio ?? '');
  const [avatar, setAvatar] = useState(usuario?.avatar ?? 85);
  const [error, setError] = useState<string | null>(null);
  const config = obtenerConfig();
  if (!usuario) return null;

  const guardar = async () => {
    setError(null);
    try {
      await api('/yo', { metodo: 'PATCH', cuerpo: { nombre, bio, avatar } });
      emitir('avatar', avatar);
      await recargar();
      await recargarPueblo();
      notificar('Perfil guardado');
    } catch (e) {
      setError(mensajeDeError(e));
    }
  };

  return (
    <div className="pila">
      <Direccion valor={usuario.direccion} />
      {usuario.rol === 'arbitro' && (
        <button type="button" className="boton" onClick={() => abrir({ tipo: 'arbitro' })}>
          Panel del árbitro
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
      <span className="etiqueta">Tu personaje</span>
      <div className="selector-avatar" role="radiogroup" aria-label="Personaje">
        {AVATARES.map((a) => (
          <button key={a} type="button" role="radio" aria-checked={a === avatar} className={a === avatar ? 'activo' : ''} onClick={() => setAvatar(a)}>
            <Avatar frame={a} tamano={36} />
          </button>
        ))}
      </div>
      <button type="button" className="boton boton-primario" onClick={guardar}>
        Guardar
      </button>
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
        Cerrar sesión
      </button>
      {error && <Aviso tipo="peligro">{error}</Aviso>}
    </div>
  );
}
