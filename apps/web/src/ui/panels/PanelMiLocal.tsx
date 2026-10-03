import { BARRIOS, COLORES_LOCAL, MAX_SERVICIOS_POR_LOCAL, type Barrio, type Servicio } from '@cryptoville/shared';
import { useState } from 'react';
import { useSesion } from '../../features/auth/sesion';
import { emitir } from '../../game/EventBus';
import { api, mensajeDeError } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { useEstado } from '../estado';
import { Aviso } from '../components/basicos';

const TAMANO_MAXIMO = 2 * 1024 * 1024;

/** Abrir o editar el local propio y sus servicios. */
export function PanelMiLocal() {
  const { usuario, local, recargar } = useSesion();
  const { locales, recargarPueblo, notificar } = useEstado();
  const [nombre, setNombre] = useState(local?.nombre ?? '');
  const [barrio, setBarrio] = useState<Barrio>(local?.barrio ?? 'diseno');
  const [color, setColor] = useState<string>(local?.color ?? COLORES_LOCAL[0]);
  const [descripcion, setDescripcion] = useState(local?.descripcion ?? '');
  const [editando, setEditando] = useState<Servicio | 'nuevo' | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!usuario) return <p className="tenue">Entra con tu wallet para abrir tu local.</p>;

  const servicios = locales.find((l) => l.usuario_id === usuario.id)?.servicios ?? [];

  const guardarLocal = async () => {
    setError(null);
    try {
      const nuevo = await api<{ lote: number }>('/mi-local', { metodo: 'PUT', cuerpo: { nombre, barrio, color, descripcion } });
      await recargar();
      await recargarPueblo();
      emitir('ir-a-lote', nuevo.lote);
      notificar(local ? 'Local actualizado' : `¡Abriste tu local en el lote ${nuevo.lote}!`);
    } catch (e) {
      setError(mensajeDeError(e));
    }
  };

  return (
    <div className="pila">
      <label className="etiqueta" htmlFor="nombre-local">
        Nombre del local
      </label>
      <input id="nombre-local" className="campo" maxLength={40} value={nombre} onChange={(e) => setNombre(e.target.value)} />
      <label className="etiqueta" htmlFor="barrio">
        Barrio
      </label>
      <select id="barrio" className="campo" value={barrio} onChange={(e) => setBarrio(e.target.value as Barrio)}>
        {(Object.keys(BARRIOS) as Barrio[]).map((b) => (
          <option key={b} value={b}>
            {BARRIOS[b].nombre}: {BARRIOS[b].descripcion}
          </option>
        ))}
      </select>
      <span className="etiqueta">Color del letrero</span>
      <div className="fila">
        {COLORES_LOCAL.map((c) => (
          <button
            key={c}
            type="button"
            className={`muestra-color ${c === color ? 'activo' : ''}`}
            style={{ background: c }}
            aria-label={`Color ${c}`}
            aria-pressed={c === color}
            onClick={() => setColor(c)}
          />
        ))}
      </div>
      <label className="etiqueta" htmlFor="desc-local">
        Descripción corta
      </label>
      <input id="desc-local" className="campo" maxLength={280} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      <button type="button" className="boton boton-primario" disabled={nombre.trim().length < 2} onClick={guardarLocal}>
        {local ? 'Guardar cambios' : 'Abrir mi local'}
      </button>
      {error && <Aviso tipo="peligro">{error}</Aviso>}

      {local && (
        <>
          <h3>
            Mis servicios ({servicios.length}/{MAX_SERVICIOS_POR_LOCAL})
          </h3>
          <ul className="lista-simple">
            {servicios.map((s) => (
              <li key={s.id} className="fila espaciada">
                <span>
                  {s.titulo} · <strong>{s.precio_usdc} USDC</strong>
                </span>
                <button type="button" className="boton boton-mini" onClick={() => setEditando(s)}>
                  Editar
                </button>
              </li>
            ))}
          </ul>
          {editando ? (
            <FormularioServicio
              servicio={editando === 'nuevo' ? null : editando}
              onListo={async (texto) => {
                setEditando(null);
                await recargarPueblo();
                notificar(texto);
              }}
              onCancelar={() => setEditando(null)}
            />
          ) : (
            servicios.length < MAX_SERVICIOS_POR_LOCAL && (
              <button type="button" className="boton" onClick={() => setEditando('nuevo')}>
                + Nuevo servicio
              </button>
            )
          )}
        </>
      )}
    </div>
  );
}

function FormularioServicio({
  servicio,
  onListo,
  onCancelar,
}: {
  servicio: Servicio | null;
  onListo: (texto: string) => void;
  onCancelar: () => void;
}) {
  const [titulo, setTitulo] = useState(servicio?.titulo ?? '');
  const [descripcion, setDescripcion] = useState(servicio?.descripcion ?? '');
  const [precio, setPrecio] = useState(servicio?.precio_usdc ?? '');
  const [dias, setDias] = useState(servicio?.dias_entrega ?? 3);
  const [foto, setFoto] = useState<string | null>(servicio?.foto_url ?? null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subirFoto = async (archivo: File) => {
    setError(null);
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(archivo.type)) return setError('Solo imágenes PNG, JPG o WEBP');
    if (archivo.size > TAMANO_MAXIMO) return setError('La imagen puede pesar hasta 2 MB');
    setSubiendo(true);
    try {
      const s = await api<{ ruta: string; token: string; url_publica: string }>('/uploads/foto', {
        cuerpo: { tipo: archivo.type, tamano: archivo.size },
      });
      const { error: e } = await supabase().storage.from('fotos').uploadToSignedUrl(s.ruta, s.token, archivo, { contentType: archivo.type });
      if (e) throw new Error('No se pudo subir la foto');
      setFoto(s.url_publica);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setSubiendo(false);
    }
  };

  const guardar = async () => {
    setError(null);
    const cuerpo = { titulo, descripcion, precio_usdc: precio, dias_entrega: Number(dias), foto_url: foto };
    try {
      if (servicio) await api(`/servicios/${servicio.id}`, { metodo: 'PATCH', cuerpo });
      else await api('/servicios', { cuerpo });
      onListo(servicio ? 'Servicio actualizado' : 'Servicio publicado');
    } catch (e) {
      setError(mensajeDeError(e));
    }
  };

  return (
    <div className="caja caja-info pila">
      <strong>{servicio ? 'Editar servicio' : 'Nuevo servicio'}</strong>
      <input className="campo" placeholder="Título (por ejemplo: Logo para tu marca)" maxLength={60} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      <textarea className="campo" rows={3} maxLength={1000} placeholder="¿Qué incluye?" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      <div className="fila">
        <label className="etiqueta">
          Precio (USDC)
          <input className="campo" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} />
        </label>
        <label className="etiqueta">
          Días de entrega
          <input className="campo" type="number" min={1} max={90} value={dias} onChange={(e) => setDias(Number(e.target.value))} />
        </label>
      </div>
      <label className="etiqueta">
        Foto (opcional, hasta 2 MB)
        <input type="file" accept="image/png,image/jpeg,image/webp" disabled={subiendo} onChange={(e) => e.target.files?.[0] && subirFoto(e.target.files[0])} />
      </label>
      {subiendo && <span className="tenue pequeno">Subiendo…</span>}
      {foto && <img src={foto} alt="" className="tarjeta-foto" />}
      <div className="fila">
        <button type="button" className="boton boton-primario" onClick={guardar}>
          Guardar
        </button>
        {servicio && (
          <button
            type="button"
            className="boton boton-peligro"
            onClick={async () => {
              try {
                await api(`/servicios/${servicio.id}`, { metodo: 'DELETE' });
                onListo('Servicio retirado');
              } catch (e) {
                setError(mensajeDeError(e));
              }
            }}
          >
            Retirar
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
