import { BARRIOS, nombreCategoria, textoCalificacion, type Barrio } from '@cryptoville/shared';
import { useEffect, useState } from 'react';
import { useSesion } from '../../features/auth/sesion';
import { cargarResenas, type ResenaPublica } from '../../features/services/datos';
import { useEstado } from '../estado';
import { chipDe } from '../villas';
import { Avatar, Direccion, Garantia, fechaCorta } from '../components/basicos';

/**
 * Lo que ves al entrar a una casa: el local con sus servicios (como en la muestra aprobada),
 * o el lote disponible para abrir un local.
 */
export function PanelLote({ lote, barrio }: { lote: number; barrio?: Barrio }) {
  const { locales, abrir, villa } = useEstado();
  const { usuario, local: miLocal } = useSesion();
  const b = barrio ?? villa;
  const local = locales.find((l) => l.lote === lote && l.barrio === b);
  const [resenas, setResenas] = useState<ResenaPublica[] | null>(null);

  useEffect(() => {
    if (local) void cargarResenas(local.usuario_id).then(setResenas);
  }, [local]);

  if (!local) {
    return (
      <div className="pila">
        <div className="lote-libre">
          <strong>Lote disponible</strong>
          <span className="tenue">Abre tu local aquí</span>
        </div>
        <p>
          Este lote de la <strong>Villa {BARRIOS[b].nombre}</strong> está disponible.
        </p>
        {usuario && !miLocal && (
          <button type="button" className="boton boton-primario" onClick={() => abrir({ tipo: 'mi-local' })}>
            Abrir mi local
          </button>
        )}
        {!usuario && <p className="tenue">Entra con tu wallet para abrir tu propio local.</p>}
        {miLocal && (
          <p className="tenue">
            Ya tienes un local en la Villa {BARRIOS[miLocal.barrio].nombre} (lote {miLocal.lote}).
          </p>
        )}
      </div>
    );
  }

  const rep = local.reputacion;
  const esMio = usuario?.id === local.usuario_id;
  return (
    <div className="local">
      <div className="local-avatar">
        <Avatar frame={local.usuario.avatar} apariencia={local.usuario.apariencia} tamano={66} titulo={local.usuario.nombre} />
      </div>
      <div>
        <h2 className="local-nombre">{local.nombre}</h2>
        <p className="tenue">
          {local.usuario.nombre} · Villa {BARRIOS[local.barrio].nombre}
        </p>
      </div>
      <div className="fila chips">
        <span className="chip" style={chipDe(local.barrio)}>
          {nombreCategoria(local.categoria)}
        </span>
        <span className="chip chip-oro">
          {rep && rep.calificacion !== null && rep.total_resenas > 0
            ? `★ ${rep.calificacion.toFixed(1)} · ${rep.total_resenas} ${rep.total_resenas === 1 ? 'reseña' : 'reseñas'}`
            : 'Sin reseñas'}
        </span>
        <span className="chip chip-verde">{rep?.nivel ?? 'Nuevo'}</span>
        {local.usuario.rol === 'arbitro' && <span className="chip chip-info">Equipo WorkVille</span>}
      </div>
      {local.descripcion && <p>{local.descripcion}</p>}

      {local.servicios.length === 0 && <p className="tenue">Este local todavía no publica servicios.</p>}
      <ul className="lista-tarjetas" aria-label="Servicios">
        {local.servicios.map((s) => (
          <li key={s.id}>
            <button type="button" className="servicio" onClick={() => abrir({ tipo: 'servicio', servicioId: s.id })}>
              {s.foto_url && <img src={s.foto_url} alt="" className="servicio-foto" />}
              <span className="servicio-texto">
                <b>{s.titulo}</b>
                <span className="tenue">Entrega en {s.dias_entrega} días</span>
              </span>
              <span className="precio">{s.precio_usdc} USDC</span>
            </button>
          </li>
        ))}
      </ul>
      {esMio ? (
        <button type="button" className="boton" onClick={() => abrir({ tipo: 'mi-local' })}>
          Editar mi local
        </button>
      ) : (
        local.servicios.length > 0 && (
          <button type="button" className="boton boton-primario" onClick={() => abrir({ tipo: 'servicio', servicioId: local.servicios[0].id })}>
            Pedir un servicio
          </button>
        )
      )}
      <Garantia />

      <section className="pila">
        <h3>Sobre {local.usuario.nombre}</h3>
        {local.usuario.bio && <p>{local.usuario.bio}</p>}
        <p className="tenue pequeno">
          {rep ? `${rep.nivel} · ${rep.completados} pedidos completados · ${textoCalificacion(rep.calificacion, rep.total_resenas)}` : 'Nuevo'}
        </p>
        <Direccion valor={local.usuario.direccion} />
      </section>

      <section className="pila">
        <h3>Reseñas</h3>
        {resenas?.length === 0 && <p className="tenue">Todavía no tiene reseñas.</p>}
        <ul className="lista-simple">
          {resenas?.map((r) => (
            <li key={r.id} className="resena">
              <div className="fila">
                <Avatar frame={r.autor.avatar} apariencia={r.autor.apariencia} tamano={28} />
                <strong>{r.autor.nombre}</strong>
                <span className="estrellas">{'★'.repeat(r.calificacion)}</span>
              </div>
              {r.comentario && <p>{r.comentario}</p>}
              <span className="tenue pequeno">{fechaCorta(r.creado_en)} · reseña de un pedido pagado en garantía</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
