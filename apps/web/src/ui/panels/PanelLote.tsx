import { BARRIOS, barrioDeLote, textoCalificacion } from '@cryptoville/shared';
import { useEffect, useState } from 'react';
import { useSesion } from '../../features/auth/sesion';
import { cargarResenas, type ResenaPublica } from '../../features/services/datos';
import { useEstado } from '../estado';
import { Avatar, Direccion, Estrellas, fechaCorta } from '../components/basicos';

/** Lo que ves al entrar a un lote: el local con sus servicios, o un lote disponible. */
export function PanelLote({ lote }: { lote: number }) {
  const { locales, abrir } = useEstado();
  const { usuario, local: miLocal } = useSesion();
  const local = locales.find((l) => l.lote === lote);
  const [resenas, setResenas] = useState<ResenaPublica[] | null>(null);
  const barrio = barrioDeLote(lote);

  useEffect(() => {
    if (local) void cargarResenas(local.usuario_id).then(setResenas);
  }, [local]);

  if (!local) {
    return (
      <div className="pila">
        <p>
          Este lote del barrio <strong>{barrio ? BARRIOS[barrio].nombre : '—'}</strong> está disponible.
        </p>
        {usuario && !miLocal && (
          <button type="button" className="boton boton-primario" onClick={() => abrir({ tipo: 'mi-local' })}>
            Abrir mi local
          </button>
        )}
        {!usuario && <p className="tenue">Entra con tu wallet para abrir tu propio local.</p>}
        {miLocal && <p className="tenue">Ya tienes un local en el lote {miLocal.lote}.</p>}
      </div>
    );
  }

  const rep = local.reputacion;
  const esMio = usuario?.id === local.usuario_id;
  return (
    <div className="pila">
      <div className="fila">
        <Avatar frame={local.usuario.avatar} tamano={48} titulo={local.usuario.nombre} />
        <div>
          <strong>{local.usuario.nombre}</strong>
          {local.usuario.rol === 'arbitro' && <span className="badge badge-info"> Equipo Cryptoville</span>}
          <div>
            <Estrellas valor={rep?.calificacion ?? null} total={rep?.total_resenas} />
          </div>
          <div className="tenue pequeno">
            {rep ? `${rep.nivel} · ${rep.completados} pedidos completados · ${textoCalificacion(rep.calificacion, rep.total_resenas)}` : 'Nuevo'}
          </div>
        </div>
      </div>
      {local.descripcion && <p>{local.descripcion}</p>}
      {local.usuario.bio && <p className="tenue">{local.usuario.bio}</p>}
      <Direccion valor={local.usuario.direccion} />

      <h3>Servicios</h3>
      {local.servicios.length === 0 && <p className="tenue">Este local todavía no publica servicios.</p>}
      <ul className="lista-tarjetas">
        {local.servicios.map((s) => (
          <li key={s.id}>
            <button type="button" className="tarjeta" onClick={() => abrir({ tipo: 'servicio', servicioId: s.id })}>
              {s.foto_url && <img src={s.foto_url} alt="" className="tarjeta-foto" />}
              <span className="tarjeta-titulo">{s.titulo}</span>
              <span className="tarjeta-precio">{s.precio_usdc} USDC</span>
              <span className="tenue pequeno">Entrega en {s.dias_entrega} días</span>
            </button>
          </li>
        ))}
      </ul>
      {esMio && (
        <button type="button" className="boton" onClick={() => abrir({ tipo: 'mi-local' })}>
          Editar mi local
        </button>
      )}

      <h3>Reseñas</h3>
      {resenas?.length === 0 && <p className="tenue">Todavía no tiene reseñas.</p>}
      <ul className="lista-simple">
        {resenas?.map((r) => (
          <li key={r.id} className="resena">
            <div className="fila">
              <Avatar frame={r.autor.avatar} tamano={24} />
              <strong>{r.autor.nombre}</strong>
              <span className="estrellas">{'★'.repeat(r.calificacion)}</span>
            </div>
            {r.comentario && <p>{r.comentario}</p>}
            <span className="tenue pequeno">{fechaCorta(r.creado_en)} · reseña de un pedido pagado en garantía</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
