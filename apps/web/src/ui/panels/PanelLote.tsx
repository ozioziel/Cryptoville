import { BARRIOS, nombreCategoria, textoCalificacion, type Barrio } from '@cryptoville/shared';
import { useEffect, useState } from 'react';
import { useSesion } from '../../features/auth/sesion';
import { cargarResenas, type ResenaPublica } from '../../features/services/datos';
import { cargarDestacados } from '../../features/portafolio/datos';
import type { Proyecto } from '@cryptoville/shared';
import { ServiciosDelLocal } from './PanelMiLocal';
import { TarjetaProyecto } from './PanelPortafolio';
import { obtenerConfig } from '../../lib/config';
import { useEstado } from '../estado';
import { chipDe } from '../villas';
import { Avatar, Direccion, Garantia, fechaCorta } from '../components/basicos';
import { BotonBloquear, BotonReportar, Nombre, Verificado } from '../components/Confianza';
import { Icono } from '../components/Iconos';

/**
 * Lo que ves al entrar a una casa: el local con sus servicios (como en la muestra aprobada),
 * o el lote disponible para abrir un local.
 */
export function PanelLote({ lote, barrio }: { lote: number; barrio?: Barrio }) {
  const { locales, abrir, villa } = useEstado();
  const { usuario, locales: misLocales } = useSesion();
  const b = barrio ?? villa;
  const local = locales.find((l) => l.lote === lote && l.barrio === b);
  const [resenas, setResenas] = useState<ResenaPublica[] | null>(null);
  const [cuadros, setCuadros] = useState<Proyecto[]>([]);

  useEffect(() => {
    if (!local) return;
    void cargarResenas(local.usuario_id).then(setResenas);
    void cargarDestacados(local.usuario_id).then(setCuadros);
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
        {usuario && misLocales.length === 0 && (
          <button type="button" className="boton boton-primario" onClick={() => abrir({ tipo: 'mi-local' })}>
            Abrir mi local
          </button>
        )}
        {!usuario && <p className="tenue">Entra para abrir tu propio local.</p>}
        {misLocales.length > 0 && (
          <>
            <p className="tenue">
              Ya tienes {misLocales.length === 1 ? 'un local' : `${misLocales.length} locales`}. Puedes abrir hasta 3 gratis; los que siguen se pagan una sola vez.
            </p>
            <button type="button" className="boton" onClick={() => abrir({ tipo: 'mis-locales' })}>
              Abrir otro local
            </button>
          </>
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
        <div className="fila espaciada">
          <h2 className="local-nombre">{local.nombre}</h2>
          {esMio && (
            <button type="button" className="boton boton-mini" onClick={() => abrir({ tipo: 'mi-local', localId: local.id })}>
              <Icono nombre="editar" tamano={14} /> Editar
            </button>
          )}
        </div>
        <p className="tenue">
          <Nombre nombre={local.usuario.nombre} verificado={local.usuario.verificado} /> · Villa {BARRIOS[local.barrio].nombre}
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

      {/* En tu propio local, los servicios se manejan aquí mismo: agregar, editar y quitar. */}
      {esMio && <ServiciosDelLocal localId={local.id} />}
      {!esMio && local.servicios.length === 0 && <p className="tenue">Este local todavía no publica servicios.</p>}
      <ul className="lista-tarjetas" aria-label="Servicios" hidden={esMio}>
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
      {!esMio && local.servicios.length > 0 && (
        <button type="button" className="boton boton-primario" onClick={() => abrir({ tipo: 'servicio', servicioId: local.servicios[0].id })}>
          Pedir un servicio
        </button>
      )}
      {/* Con el contrato v2 cada servicio ofrece tres formas de pagar (se eligen al pedirlo). */}
      {!obtenerConfig().contrato_v2_id && <Garantia />}

      {cuadros.length > 0 && (
        <section className="pila-compacta">
          <h3>En la pared</h3>
          <div className="grilla-proyectos">
            {cuadros.map((p) => (
              <TarjetaProyecto key={p.id} proyecto={p} marcarPared={false} onAbrir={() => abrir({ tipo: 'proyecto', id: p.id })} />
            ))}
          </div>
        </section>
      )}

      <section className="pila">
        <h3 className="fila">
          Sobre {local.usuario.nombre} <Verificado si={local.usuario.verificado} />
        </h3>
        {local.usuario.bio && <p>{local.usuario.bio}</p>}
        <p className="tenue pequeno">
          {rep ? `${rep.nivel} · ${rep.completados} pedidos completados · ${textoCalificacion(rep.calificacion, rep.total_resenas)}` : 'Nuevo'}
        </p>
        <Direccion valor={local.usuario.direccion} />
        <button type="button" className="boton" onClick={() => abrir({ tipo: 'portafolio', usuarioId: local.usuario_id })}>
          <Icono nombre="cuadro" /> Ver su portafolio
        </button>
        {!esMio && (
          <div className="fila">
            <BotonReportar tipo="local" objetoId={local.id} nombre={local.nombre} />
            <BotonReportar tipo="persona" objetoId={local.usuario_id} nombre={local.usuario.nombre} />
            <BotonBloquear usuarioId={local.usuario_id} nombre={local.usuario.nombre} />
          </div>
        )}
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
              <span className="fila espaciada">
                <span className="tenue pequeno">{fechaCorta(r.creado_en)} · reseña de un pedido pagado</span>
                <BotonReportar tipo="resena" objetoId={r.id} nombre={'la reseña de ' + r.autor.nombre} />
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/**
 * Lote disponible, según el rol del modo:
 * - «Quiero contratar» (cliente): publicar lo que necesitas. El «Se busca» aparece como cartel en «Quiero trabajar».
 * - «Quiero trabajar» (proveedor): abrir tu local. El local aparece en «Quiero contratar», donde lo encuentran los clientes.
 */
export function PanelLoteLibre({ barrio }: { barrio: Barrio }) {
  const { abrir, modo } = useEstado();
  const { usuario, locales: misLocales } = useSesion();
  const villa = BARRIOS[barrio].nombre;

  if (modo === 'contratar') {
    return (
      <div className="pila">
        <div className="lote-libre">
          <strong>Lote disponible</strong>
          <span className="tenue">Publica lo que necesitas</span>
        </div>
        <p>
          ¿Buscas a alguien para un trabajo en la <strong>Villa {villa}</strong>? Publica lo que necesitas y los proveedores te mandan sus
          propuestas.
        </p>
        <p className="tenue pequeno">Tu «Se busca» aparece como un cartel en el modo «Quiero trabajar», donde lo ven los proveedores.</p>
        <button
          type="button"
          className="boton boton-primario"
          onClick={() => abrir(usuario ? { tipo: 'publicar-busqueda', barrio } : { tipo: 'bienvenida' })}
        >
          {usuario ? 'Publicar lo que necesito' : 'Entra para publicar'}
        </button>
      </div>
    );
  }

  return (
    <div className="pila">
      <div className="lote-libre">
        <strong>Lote disponible</strong>
        <span className="tenue">Abre tu local</span>
      </div>
      <p>
        ¿Ofreces tus servicios? Abre tu local en la <strong>Villa {villa}</strong> y suma hasta 6 servicios.
      </p>
      <p className="tenue pequeno">Tu local aparece en el modo «Quiero contratar», donde te encuentran los clientes.</p>
      {!usuario && (
        <button type="button" className="boton boton-primario" onClick={() => abrir({ tipo: 'bienvenida' })}>
          Entra para abrir tu local
        </button>
      )}
      {usuario && misLocales.length === 0 && (
        <button type="button" className="boton boton-primario" onClick={() => abrir({ tipo: 'mi-local' })}>
          Abrir mi local
        </button>
      )}
      {usuario && misLocales.length > 0 && (
        <>
          <p className="tenue">
            Ya tienes {misLocales.length === 1 ? 'un local' : `${misLocales.length} locales`}. Puedes abrir hasta 3 gratis; los que siguen se pagan una sola vez.
          </p>
          <button type="button" className="boton boton-primario" onClick={() => abrir({ tipo: 'mis-locales' })}>
            Mis locales
          </button>
        </>
      )}
    </div>
  );
}
