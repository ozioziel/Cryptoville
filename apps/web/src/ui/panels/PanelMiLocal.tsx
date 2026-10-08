import {
  BARRIOS,
  CAMPOS_CASA,
  CATALOGO_CASA,
  COLORES_LOCAL,
  LISTA_BARRIOS,
  MAX_SERVICIOS_POR_LOCAL,
  esCategoriaDe,
  normalizarAparienciaCasa,
  type AparienciaCasa,
  type Barrio,
  type CampoCasa,
  type OpcionPieza,
  type Servicio,
} from '@cryptoville/shared';
import { useMemo, useState } from 'react';
import { crearCasa, crearInterior } from '../../arte/casa';
import { useSesion } from '../../features/auth/sesion';
import { emitir } from '../../game/EventBus';
import { api, mensajeDeError } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { useEstado } from '../estado';
import { Aviso } from '../components/basicos';
import { Pestanas, SelectorPieza } from '../components/Editor';
import { Icono } from '../components/Iconos';

const TAMANO_MAXIMO = 2 * 1024 * 1024;

/** Paleta cerrada para el toldo, la puerta y el letrero de la casa. */
const COLORES_DUENO: readonly OpcionPieza[] = COLORES_LOCAL.map((color, i) => ({
  id: color,
  nombre: ['Coral', 'Azul', 'Verde', 'Mostaza', 'Lavanda', 'Salvia', 'Arena', 'Rosa'][i] ?? color,
  color,
}));

/**
 * Abrir o editar uno de mis locales, su casa (por fuera y por dentro) y sus servicios.
 * - Sin `localId`: el local principal (o abrir el primero).
 * - `localId="nuevo"`: abrir otro local (hasta 3 gratis; el cuarto, después de pagarlo en «Mis locales»).
 */
export function PanelMiLocal({ localId }: { localId?: string }) {
  const { usuario, local: principal, locales: mios, recargar } = useSesion();
  const { locales, recargarPueblo, notificar, villa, cambiar } = useEstado();
  const local = localId === 'nuevo' ? null : localId ? (mios.find((l) => l.id === localId) ?? null) : principal;
  const [nombre, setNombre] = useState(local?.nombre ?? '');
  const [barrio, setBarrio] = useState<Barrio>(local?.barrio ?? villa);
  const [categoria, setCategoria] = useState<string>(local?.categoria ?? BARRIOS[local?.barrio ?? villa].categorias[0].id);
  const [color, setColor] = useState<string>(local?.color ?? COLORES_LOCAL[0]);
  const [descripcion, setDescripcion] = useState(local?.descripcion ?? '');
  const [casa, setCasa] = useState<AparienciaCasa>(() => normalizarAparienciaCasa(local?.barrio ?? villa, local?.apariencia));
  const [parte, setParte] = useState<'exterior' | 'interior'>('exterior');
  const [editando, setEditando] = useState<Servicio | 'nuevo' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const vistaExterior = useMemo(() => crearCasa({ barrio, apariencia: casa, color, nombre: nombre.trim() || 'Tu local' }), [barrio, casa, color, nombre]);
  const vistaInterior = useMemo(() => crearInterior({ barrio, apariencia: casa, color }), [barrio, casa, color]);

  if (!usuario) return <p className="tenue">Entra para abrir tu local.</p>;
  if (localId && localId !== 'nuevo' && !local) return <p className="tenue">Ese local no es tuyo o ya no existe.</p>;

  const servicios = local ? (locales.find((l) => l.id === local.id)?.servicios ?? []) : [];

  const cambiarVilla = (b: Barrio) => {
    setBarrio(b);
    // La categoría y las piezas de la casa tienen que ser de la villa nueva.
    if (!esCategoriaDe(b, categoria)) setCategoria(BARRIOS[b].categorias[0].id);
    setCasa((c) => normalizarAparienciaCasa(b, c));
  };

  const guardarLocal = async () => {
    setError(null);
    setGuardando(true);
    try {
      const cuerpo = { nombre, barrio, categoria, color, descripcion, apariencia: casa };
      const nuevo = local
        ? await api<{ id: string; lote: number; barrio: Barrio }>(`/locales/${local.id}`, { metodo: 'PUT', cuerpo })
        : await api<{ id: string; lote: number; barrio: Barrio }>(mios.length ? '/locales' : '/mi-local', { metodo: mios.length ? 'POST' : 'PUT', cuerpo });
      await recargar();
      await recargarPueblo();
      emitir('ir-a-local', { barrio: nuevo.barrio, lote: nuevo.lote });
      notificar(local ? 'Local actualizado' : `¡Abriste tu local en la Villa ${BARRIOS[nuevo.barrio].nombre}!`);
      // Después de abrir uno nuevo, el panel sigue con ese local (para sumarle servicios).
      if (!local) cambiar({ tipo: 'mi-local', localId: nuevo.id });
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="pila">
      <label className="etiqueta" htmlFor="nombre-local">
        Nombre del local
      </label>
      <input id="nombre-local" className="campo" maxLength={40} value={nombre} onChange={(e) => setNombre(e.target.value)} />
      <label className="etiqueta" htmlFor="barrio">
        Villa
      </label>
      <select id="barrio" className="campo" value={barrio} onChange={(e) => cambiarVilla(e.target.value as Barrio)}>
        {LISTA_BARRIOS.map((b) => (
          <option key={b} value={b}>
            {BARRIOS[b].nombre}: {BARRIOS[b].descripcion}
          </option>
        ))}
      </select>
      {local && local.barrio !== barrio && (
        <p className="tenue pequeno">Al cambiar de villa, tu casa se muda al primer lote libre de la Villa {BARRIOS[barrio].nombre}.</p>
      )}
      <label className="etiqueta" htmlFor="categoria">
        Categoría
      </label>
      <select id="categoria" className="campo" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
        {BARRIOS[barrio].categorias.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
      <label className="etiqueta" htmlFor="desc-local">
        Descripción corta
      </label>
      <input id="desc-local" className="campo" maxLength={280} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />

      <section className="editor" aria-label="Tu casa">
        <span className="etiqueta">Tu casa</span>
        <Pestanas
          etiqueta="Parte de la casa"
          opciones={[
            { id: 'exterior', nombre: 'Por fuera' },
            { id: 'interior', nombre: 'Por dentro' },
          ]}
          valor={parte}
          onCambiar={setParte}
        />
        <div
          className={`editor-vista editor-vista-${parte}`}
          role="img"
          aria-label={parte === 'exterior' ? 'Vista previa de la casa por fuera' : 'Vista previa de la casa por dentro'}
          dangerouslySetInnerHTML={{ __html: parte === 'exterior' ? vistaExterior : vistaInterior }}
        />
        {parte === 'exterior' && (
          <SelectorPieza etiqueta="Color del toldo, la puerta y el letrero" opciones={COLORES_DUENO} valor={color} onCambiar={setColor} />
        )}
        {CAMPOS_CASA.filter((c) => c.parte === parte).map(({ campo, nombre: etiqueta }) => (
          <SelectorPieza
            key={campo}
            etiqueta={etiqueta}
            opciones={CATALOGO_CASA[barrio][campo as CampoCasa]}
            valor={casa[campo]}
            onCambiar={(v) => setCasa((c) => ({ ...c, [campo]: v }))}
          />
        ))}
        <p className="tenue pequeno">Las piezas son del estilo de la Villa {BARRIOS[barrio].nombre}, para que la villa conserve su identidad.</p>
      </section>

      <button type="button" className="boton boton-primario" disabled={nombre.trim().length < 2 || guardando} onClick={guardarLocal}>
        {guardando ? 'Guardando…' : local ? 'Guardar cambios' : 'Abrir mi local'}
      </button>
      {error && <Aviso tipo="peligro">{error}</Aviso>}
      {!local && mios.length > 0 && (
        <p className="tenue pequeno">
          Es tu local número {mios.length + 1}. Los primeros 3 son gratis; los que siguen se pagan una sola vez desde «Mis locales».
        </p>
      )}

      {local && (
        <>
          <h3>
            Mis servicios ({servicios.length}/{MAX_SERVICIOS_POR_LOCAL})
          </h3>
          <ul className="lista-tarjetas">
            {servicios.map((s) => (
              <li key={s.id} className="servicio">
                <span className="servicio-texto">
                  <b>{s.titulo}</b>
                  <span className="tenue">Entrega en {s.dias_entrega} días</span>
                </span>
                <span className="precio">{s.precio_usdc} USDC</span>
                <button type="button" className="boton boton-mini" onClick={() => setEditando(s)}>
                  <Icono nombre="editar" tamano={14} /> Editar
                </button>
              </li>
            ))}
          </ul>
          {editando ? (
            <FormularioServicio
              localId={local.id}
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
                <Icono nombre="mas" /> Nuevo servicio
              </button>
            )
          )}
        </>
      )}
    </div>
  );
}

function FormularioServicio({
  localId,
  servicio,
  onListo,
  onCancelar,
}: {
  localId: string;
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
      else await api('/servicios', { cuerpo: { ...cuerpo, local_id: localId } });
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
        <input type="file" className="campo-archivo" accept="image/png,image/jpeg,image/webp" disabled={subiendo} onChange={(e) => e.target.files?.[0] && subirFoto(e.target.files[0])} />
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
