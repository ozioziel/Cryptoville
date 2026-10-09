import { NOMBRE_NIVEL_IDIOMA, nombreCategoria, SECCIONES_CV, TIPOS_EXPERIENCIA, type CvPublico, type Experiencia, type Reputacion } from '@cryptoville/shared';
import { useEffect, useMemo, useState } from 'react';
import { useSesion } from '../../features/auth/sesion';
import { cargarCvPublico, cargarMiCv, urlPdf } from '../../features/plaza/datos';
import { cargarPortafolio, fechasCv, type Portafolio } from '../../features/portafolio/datos';
import { cargarReputaciones, type UsuarioPublico } from '../../features/services/datos';
import { supabase } from '../../lib/supabase';
import { useEstado } from '../estado';
import { Aviso, Avatar, Cargando, Estrellas } from '../components/basicos';
import { BotonReportar, Nombre } from '../components/Confianza';
import { Icono } from '../components/Iconos';
import { EnlaceExterno, TarjetaProyecto } from './PanelPortafolio';
import { ubicacionLocal } from './PanelMisLocales';
import { TrabajosVerificados } from './PanelTrabajos';

async function cargarPersona(id: string): Promise<UsuarioPublico | null> {
  const { data } = await supabase().from('usuarios').select('id, nombre, avatar, apariencia, direccion, bio, rol, verificado, lote_plaza').eq('id', id).maybeSingle();
  return (data as UsuarioPublico | null) ?? null;
}

/** Una sección del CV (experiencia, educación…): cada elemento con su período, descripción y enlace. */
function SeccionCv({ titulo, elementos, mostrarPrivado }: { titulo: string; elementos: Experiencia[]; mostrarPrivado: boolean }) {
  if (!elementos.length) return null;
  return (
    <section className="cv-seccion">
      <h3>{titulo}</h3>
      <ul className="cv-lista">
        {elementos.map((e) => (
          <li key={e.id}>
            <span className="cv-punto" aria-hidden="true" />
            <div className="pila-compacta">
              <strong>
                {e.puesto} <span className="tenue">· {e.lugar}</span>
                {mostrarPrivado && !e.publico && <span className="badge badge-apagado">Privado</span>}
              </strong>
              <span className="tenue pequeno">{fechasCv(e)}</span>
              {e.descripcion && <p className="texto-largo pequeno">{e.descripcion}</p>}
              {e.enlace && <EnlaceExterno enlace={{ url: e.enlace, titulo: e.tipo === 'certificacion' ? 'Ver la credencial' : undefined }} />}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * El edificio de una persona en la Plaza principal: su CV (al estilo de LinkedIn) y sus locales.
 * Desde aquí no se pide nada: cada local tiene «Ir al local».
 */
export function PanelEdificio({ usuarioId }: { usuarioId: string }) {
  const { usuario } = useSesion();
  const { locales, abrir, cerrar, irAlLocal } = useEstado();
  const [persona, setPersona] = useState<UsuarioPublico | null | undefined>(undefined);
  const [cv, setCv] = useState<CvPublico | null>(null);
  const [portafolio, setPortafolio] = useState<Portafolio | null>(null);
  const [reputacion, setReputacion] = useState<Reputacion | null>(null);
  const esMio = usuario?.id === usuarioId;

  useEffect(() => {
    void cargarPersona(usuarioId).then(setPersona);
    void (esMio ? cargarMiCv(usuarioId) : cargarCvPublico(usuarioId)).then(setCv);
    cargarPortafolio(usuarioId).then(setPortafolio, () => setPortafolio({ experiencias: [], proyectos: [] }));
    void cargarReputaciones([usuarioId]).then((m) => setReputacion(m.get(usuarioId) ?? null));
  }, [usuarioId, esMio]);

  const susLocales = useMemo(() => locales.filter((l) => l.usuario_id === usuarioId), [locales, usuarioId]);
  const porTipo = useMemo(() => {
    const m = new Map(TIPOS_EXPERIENCIA.map((t) => [t, [] as Experiencia[]]));
    for (const e of portafolio?.experiencias ?? []) m.get(e.tipo ?? 'trabajo')?.push(e);
    return m;
  }, [portafolio]);

  if (persona === undefined || !portafolio) return <Cargando />;
  if (!persona) return <p className="tenue">Este edificio ya no está en la Plaza.</p>;
  const vacio = !cv?.acerca_de && !cv?.habilidades.length && !cv?.idiomas.length && !portafolio.experiencias.length && !portafolio.proyectos.length;

  return (
    <div className="pila cv">
      <header className="cv-cabecera">
        <Avatar frame={persona.avatar} apariencia={persona.apariencia} tamano={64} titulo={persona.nombre} />
        <div className="pila-compacta">
          <Nombre nombre={persona.nombre} verificado={persona.verificado} fuerte />
          {persona.bio && <span className="tenue">{persona.bio}</span>}
          <span className="fila pequeno">
            <Estrellas valor={reputacion?.calificacion ?? null} total={reputacion?.total_resenas} />
            {reputacion && reputacion.completados > 0 && (
              <span className="tenue">
                · {reputacion.completados} {reputacion.completados === 1 ? 'trabajo terminado' : 'trabajos terminados'}
              </span>
            )}
          </span>
        </div>
      </header>
      <div className="fila">
        {cv?.pdf_ruta && (
          <a className="boton boton-mini" href={urlPdf(cv.pdf_ruta)} target="_blank" rel="noopener noreferrer" download>
            <Icono nombre="documento" tamano={14} /> Descargar su CV (PDF)
          </a>
        )}
        {esMio ? (
          <button type="button" className="boton boton-mini boton-primario" onClick={() => abrir({ tipo: 'mi-portafolio' })}>
            <Icono nombre="editar" tamano={14} /> Editar mi CV
          </button>
        ) : (
          <BotonReportar tipo="cv" objetoId={usuarioId} nombre={`el CV de ${persona.nombre}`} />
        )}
      </div>
      {esMio && <p className="tenue pequeno">Así ven tu edificio los demás. Lo marcado como «Privado» solo lo ves tú.</p>}
      {vacio && <Aviso>{esMio ? 'Todavía no armaste tu CV: cuéntales a los clientes quién eres.' : 'Todavía no armó su CV.'}</Aviso>}

      {cv?.acerca_de && (
        <section className="cv-seccion">
          <h3>Acerca de mí</h3>
          <p className="texto-largo">{cv.acerca_de}</p>
        </section>
      )}

      <TrabajosVerificados usuarioId={usuarioId} />

      {TIPOS_EXPERIENCIA.map((t) => (
        <SeccionCv key={t} titulo={SECCIONES_CV[t].titulo} elementos={porTipo.get(t) ?? []} mostrarPrivado={esMio} />
      ))}

      {!!cv?.habilidades.length && (
        <section className="cv-seccion">
          <h3>Habilidades</h3>
          <div className="fila chips-cv">
            {cv.habilidades.map((h) => (
              <span key={h} className="chip">
                {h}
              </span>
            ))}
          </div>
        </section>
      )}

      {!!cv?.idiomas.length && (
        <section className="cv-seccion">
          <h3>Idiomas</h3>
          <ul className="lista-simple">
            {cv.idiomas.map((i) => (
              <li key={i.idioma} className="fila espaciada">
                <span>{i.idioma}</span>
                <span className="tenue pequeno">{NOMBRE_NIVEL_IDIOMA[i.nivel]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {portafolio.proyectos.length > 0 && (
        <section className="cv-seccion">
          <h3>Proyectos</h3>
          <div className="grilla-proyectos">
            {portafolio.proyectos.map((p) => (
              <TarjetaProyecto key={p.id} proyecto={p} onAbrir={() => abrir({ tipo: 'proyecto', id: p.id })} />
            ))}
          </div>
        </section>
      )}

      <section className="cv-seccion">
        <h3>{susLocales.length === 1 ? 'Su local' : `Sus locales (${susLocales.length})`}</h3>
        <p className="tenue pequeno">Desde el edificio no se pide: entra al local para ver cada servicio y pedirlo.</p>
        <ul className="lista-tarjetas">
          {susLocales.map((l) => (
            <li key={l.id} className="servicio cv-local">
              <span className="tarjeta-local-color" style={{ background: l.color }} aria-hidden="true" />
              <span className="servicio-texto">
                <b>{l.nombre}</b>
                <span className="tenue pequeno">
                  {ubicacionLocal(l)} · {nombreCategoria(l.categoria)}
                </span>
                {l.servicios.length > 0 ? (
                  <ul className="cv-servicios">
                    {l.servicios.map((s) => (
                      <li key={s.id} className="fila espaciada pequeno">
                        <span>{s.titulo}</span>
                        <span className="precio">{s.precio_usdc} USDC</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="tenue pequeno">Todavía no tiene servicios.</span>
                )}
              </span>
              <button
                type="button"
                className="boton boton-mini"
                onClick={() => {
                  cerrar();
                  irAlLocal(l);
                }}
              >
                Ir al local <Icono nombre="flecha" tamano={14} />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** La Casa de la Plaza: qué es la Plaza principal, tu edificio y quiénes tienen edificio. */
export function PanelPlaza() {
  const { usuario, locales: misLocales } = useSesion();
  const { edificios, irAlEdificio, cerrar, abrir, cambiarModo } = useEstado();
  const [texto, setTexto] = useState('');
  const mio = usuario ? edificios.find((e) => e.usuarioId === usuario.id) : undefined;
  const lista = edificios.filter((e) => e.nombre.toLowerCase().includes(texto.trim().toLowerCase()));

  const ir = (id: string) => {
    cerrar();
    irAlEdificio(id);
  };

  return (
    <div className="pila">
      <p>
        La <b>Plaza principal</b> reúne los CVs de quienes trabajan en WorkVille: cada persona con al menos un local tiene su edificio. Entra para
        conocer su experiencia, sus trabajos verificados y sus locales.
      </p>
      {usuario && mio && (
        <div className="caja caja-info pila-compacta">
          <strong>Tu edificio está en la Plaza</strong>
          <div className="fila">
            <button type="button" className="boton boton-mini boton-primario" onClick={() => ir(usuario.id)}>
              <Icono nombre="edificio" tamano={14} /> Ir a mi edificio
            </button>
            <button type="button" className="boton boton-mini" onClick={() => abrir({ tipo: 'mi-portafolio' })}>
              <Icono nombre="editar" tamano={14} /> Editar mi CV
            </button>
          </div>
        </div>
      )}
      {usuario && !mio && misLocales.length === 0 && (
        <div className="caja pila-compacta">
          <span className="pequeno">Para tener tu edificio aquí, abre tu local en «Quiero trabajar».</span>
          <button
            type="button"
            className="boton boton-mini"
            onClick={() => {
              cerrar();
              cambiarModo('trabajar');
              abrir({ tipo: 'mi-local' });
            }}
          >
            <Icono nombre="casa" tamano={14} /> Abrir mi local
          </button>
        </div>
      )}
      <label className="etiqueta" htmlFor="buscar-persona">
        Buscar a una persona
      </label>
      <input id="buscar-persona" className="campo" type="search" placeholder="Nombre" value={texto} onChange={(e) => setTexto(e.target.value)} />
      {lista.length === 0 && <p className="tenue">{edificios.length ? 'Nadie con ese nombre.' : 'Todavía no hay edificios.'}</p>}
      <ul className="lista-tarjetas">
        {lista.map((e) => (
          <li key={e.usuarioId} className="servicio">
            <span className="fila">
              <Avatar frame={e.avatar} apariencia={e.apariencia ?? null} tamano={32} titulo={e.nombre} />
              <span className="servicio-texto">
                <Nombre nombre={e.nombre} verificado={e.verificado} />
                <span className="tenue pequeno">
                  {e.locales} {e.locales === 1 ? 'local' : 'locales'}
                </span>
              </span>
            </span>
            <button type="button" className="boton boton-mini" onClick={() => ir(e.usuarioId)}>
              Ir a su edificio <Icono nombre="flecha" tamano={14} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
