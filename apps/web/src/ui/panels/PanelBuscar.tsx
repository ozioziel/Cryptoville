import { BARRIOS, LISTA_BARRIOS, nombreCategoria, type Barrio, type Reputacion } from '@cryptoville/shared';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSesion } from '../../features/auth/sesion';
import { cargarSeBusca, type BusquedaPublica } from '../../features/busquedas/datos';
import { filtrarSeBusca, type OrdenSeBusca } from '../../features/busquedas/filtrar';
import { buscarServicios, type OrdenServicios } from '../../features/services/buscar';
import { cargarReputaciones } from '../../features/services/datos';
import { esCelular } from '../../lib/dispositivo';
import { mensajeDeError } from '../../lib/api';
import { useEstado, type PestanaBuscar } from '../estado';
import { chipDe, portadaDe } from '../villas';
import { Aviso, Avatar, Cargando, Estrellas, fechaDia } from '../components/basicos';
import { Nombre } from '../components/Confianza';
import { Pestanas } from '../components/Editor';
import { Icono } from '../components/Iconos';
import { BotonesIr } from '../components/BotonesIr';

/**
 * El tablón gigante de afiches (la lupa y el tablón de cada villa abren lo mismo), a pantalla completa:
 * - «Quiero contratar»: los servicios de los locales;
 * - «Quiero trabajar»: lo que la gente necesita («Se busca»).
 * Cambiar de pestaña cambia el modo de la villa. Cada resultado es un afiche clavado en el corcho.
 */
export function PanelBuscar({ pestana = 'servicios' }: { pestana?: PestanaBuscar }) {
  const { cambiar, cambiarModo } = useEstado();
  return (
    <div className="tablon">
      <Pestanas
        etiqueta="Qué quieres hacer"
        opciones={[
          { id: 'servicios', nombre: 'Quiero contratar' },
          { id: 'se-busca', nombre: 'Quiero trabajar' },
        ]}
        valor={pestana}
        onCambiar={(p) => {
          cambiar({ tipo: 'buscar', pestana: p });
          // La villa cambia de modo junto con la pestaña.
          cambiarModo(p === 'se-busca' ? 'trabajar' : 'contratar');
        }}
      />
      {pestana === 'servicios' ? <BuscarServicios /> : <BuscarSeBusca />}
    </div>
  );
}

/** Los filtros se pliegan (en el celular empiezan cerrados). */
function Filtros({ activos, children }: { activos: number; children: ReactNode }) {
  const [abiertos] = useState(() => !esCelular());
  return (
    <details className="tablon-filtros" open={abiertos}>
      <summary>
        <Icono nombre="fases" tamano={16} /> Filtros{activos > 0 ? ` (${activos})` : ''}
      </summary>
      <div className="tablon-filtros-campos">{children}</div>
    </details>
  );
}

/** Selectores de villa y categoría (las categorías dependen de la villa elegida). */
function FiltrosVilla({
  barrio,
  categoria,
  onBarrio,
  onCategoria,
}: {
  barrio: Barrio | 'todos';
  categoria: string;
  onBarrio: (b: Barrio | 'todos') => void;
  onCategoria: (c: string) => void;
}) {
  const villasDeCategorias = barrio === 'todos' ? LISTA_BARRIOS : [barrio];
  return (
    <>
      <label className="etiqueta">
        Villa
        <select
          className="campo"
          value={barrio}
          onChange={(e) => {
            const b = e.target.value as Barrio | 'todos';
            onBarrio(b);
            if (b !== 'todos' && !BARRIOS[b].categorias.some((c) => c.id === categoria)) onCategoria('todas');
          }}
        >
          <option value="todos">Todas las villas</option>
          {LISTA_BARRIOS.map((b) => (
            <option key={b} value={b}>
              Villa {BARRIOS[b].nombre}
            </option>
          ))}
        </select>
      </label>
      <label className="etiqueta">
        Categoría
        <select className="campo" value={categoria} onChange={(e) => onCategoria(e.target.value)}>
          <option value="todas">Todas las categorías</option>
          {villasDeCategorias.map((b) => (
            <optgroup key={b} label={`Villa ${BARRIOS[b].nombre}`}>
              {BARRIOS[b].categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
    </>
  );
}

function SoloVerificados({ valor, onCambiar }: { valor: boolean; onCambiar: (v: boolean) => void }) {
  return (
    <label className="fila pequeno tablon-check">
      <input type="checkbox" checked={valor} onChange={(e) => onCambiar(e.target.checked)} /> Solo con identidad verificada
    </label>
  );
}

const numero = (v: string) => (v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);

function BuscarServicios() {
  const { locales, abrir, villa } = useEstado();
  const [texto, setTexto] = useState('');
  const [barrio, setBarrio] = useState<Barrio | 'todos'>('todos');
  const [categoria, setCategoria] = useState<string>('todas');
  const [precio, setPrecio] = useState('');
  const [plazo, setPlazo] = useState('');
  const [verificados, setVerificados] = useState(false);
  const [orden, setOrden] = useState<OrdenServicios>('reputacion');
  const resultados = useMemo(
    () =>
      buscarServicios(locales, {
        texto,
        barrio,
        categoria,
        precioMaximo: numero(precio),
        plazoMaximo: plazo ? Number(plazo) : null,
        soloVerificados: verificados,
        orden,
      }),
    [locales, texto, barrio, categoria, precio, plazo, verificados, orden],
  );
  const activos = [barrio !== 'todos', categoria !== 'todas', !!precio, !!plazo, verificados].filter(Boolean).length;

  return (
    <div className="pila">
      <div className="campo-con-icono">
        <Icono nombre="buscar" />
        <input
          className="campo"
          type="search"
          placeholder="¿Qué buscas? logo, inglés, página web…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          aria-label="Buscar servicios"
          autoFocus={!esCelular()}
        />
      </div>
      <Filtros activos={activos}>
        <FiltrosVilla barrio={barrio} categoria={categoria} onBarrio={setBarrio} onCategoria={setCategoria} />
        <label className="etiqueta">
          Precio máximo (USDC)
          <input className="campo" inputMode="decimal" placeholder="Sin tope" value={precio} onChange={(e) => setPrecio(e.target.value)} />
        </label>
        <label className="etiqueta">
          Plazo de entrega
          <select className="campo" value={plazo} onChange={(e) => setPlazo(e.target.value)}>
            <option value="">Cualquiera</option>
            {[1, 3, 7, 15, 30].map((d) => (
              <option key={d} value={d}>
                Hasta {d} {d === 1 ? 'día' : 'días'}
              </option>
            ))}
          </select>
        </label>
        <label className="etiqueta">
          Ordenar por
          <select className="campo" value={orden} onChange={(e) => setOrden(e.target.value as OrdenServicios)}>
            <option value="reputacion">Mejor reputación</option>
            <option value="nuevos">Más nuevos</option>
            <option value="precio-menor">Precio: de menor a mayor</option>
            <option value="precio-mayor">Precio: de mayor a menor</option>
          </select>
        </label>
        <SoloVerificados valor={verificados} onCambiar={setVerificados} />
      </Filtros>
      <p className="tablon-cuenta">
        {resultados.length} {resultados.length === 1 ? 'afiche' : 'afiches'}
      </p>
      <ul className="afiches">
        {resultados.map(({ servicio, local }) => (
          <li key={servicio.id} className="afiche">
            <span className="afiche-chincheta" style={{ background: BARRIOS[local.barrio].color }} aria-hidden="true" />
            <button type="button" className="afiche-foto" style={{ background: portadaDe(local.barrio) }} onClick={() => abrir({ tipo: 'servicio', servicioId: servicio.id })} aria-label={`Ver ${servicio.titulo}`}>
              {servicio.foto_url ? <img src={servicio.foto_url} alt="" loading="lazy" /> : <Icono nombre={local.barrio} tamano={34} color="#fff" />}
            </button>
            <b className="afiche-titulo">{servicio.titulo}</b>
            <span className="afiche-precio">{servicio.precio_usdc} USDC</span>
            <span className="fila pequeno afiche-persona">
              <Avatar frame={local.usuario.avatar} apariencia={local.usuario.apariencia} tamano={22} />
              <Nombre nombre={local.usuario.nombre} verificado={local.usuario.verificado} />
            </span>
            <span className="fila pequeno afiche-datos">
              <span className="chip" style={chipDe(local.barrio)}>
                {nombreCategoria(local.categoria)}
              </span>
              <Estrellas valor={local.reputacion?.calificacion ?? null} />
            </span>
            <span className="tenue pequeno">
              Villa {BARRIOS[local.barrio].nombre} · entrega en {servicio.dias_entrega} {servicio.dias_entrega === 1 ? 'día' : 'días'}
            </span>
            <span className="afiche-acciones">
              <BotonesIr local={local} />
            </span>
          </li>
        ))}
      </ul>
      {resultados.length === 0 && <p className="tablon-vacio">No hay afiches con esos filtros.</p>}
      {/* Si no está lo que necesita, puede publicarlo para que los proveedores le escriban. */}
      <div className="caja caja-aviso pila tablon-nota">
        <strong>¿No lo encuentras?</strong>
        <span className="pequeno">Publica un «Se busca» con lo que necesitas y los proveedores te mandan sus propuestas.</span>
        <button type="button" className="boton" onClick={() => abrir({ tipo: 'publicar-busqueda', barrio: barrio === 'todos' ? villa : barrio })}>
          <Icono nombre="chincheta" /> Publicar un «Se busca»
        </button>
      </div>
    </div>
  );
}

function BuscarSeBusca() {
  const { abrir, version, villa, edificios, cerrar, irAlEdificio } = useEstado();
  const { usuario } = useSesion();
  const [busquedas, setBusquedas] = useState<BusquedaPublica[] | null>(null);
  const [reputaciones, setReputaciones] = useState<Map<string, Reputacion>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [barrio, setBarrio] = useState<Barrio | 'todos'>('todos');
  const [categoria, setCategoria] = useState<string>('todas');
  const [minimo, setMinimo] = useState('');
  const [plazo, setPlazo] = useState('');
  const [verificados, setVerificados] = useState(false);
  const [orden, setOrden] = useState<OrdenSeBusca>('nuevos');

  useEffect(() => {
    cargarSeBusca().then(
      (lista) => {
        setBusquedas(lista);
        void cargarReputaciones([...new Set(lista.map((b) => b.autor_id))]).then(setReputaciones);
      },
      (e) => setError(mensajeDeError(e)),
    );
  }, [version]);

  const resultados = useMemo(() => {
    const notas = new Map([...reputaciones].map(([id, r]) => [id, r.calificacion]));
    return filtrarSeBusca(
      busquedas ?? [],
      { texto, barrio, categoria, presupuestoMinimo: numero(minimo), plazoDias: plazo ? Number(plazo) : null, soloVerificados: verificados, orden },
      notas,
    );
  }, [busquedas, reputaciones, texto, barrio, categoria, minimo, plazo, verificados, orden]);
  const activos = [barrio !== 'todos', categoria !== 'todas', !!minimo, !!plazo, verificados].filter(Boolean).length;

  return (
    <div className="pila">
      <div className="fila espaciada">
        <span className="tablon-subtitulo">Lo que la gente necesita. Mándale tu propuesta.</span>
        <button
          type="button"
          className="boton boton-mini"
          onClick={() => abrir(usuario ? { tipo: 'publicar-busqueda', barrio: barrio === 'todos' ? villa : barrio } : { tipo: 'bienvenida' })}
        >
          <Icono nombre="chincheta" tamano={14} /> Publicar
        </button>
      </div>
      <div className="campo-con-icono">
        <Icono nombre="maletin" />
        <input
          className="campo"
          type="search"
          placeholder="¿Qué trabajo buscas? logo, video, clases…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          aria-label="Buscar en los Se busca"
          autoFocus={!esCelular()}
        />
      </div>
      <Filtros activos={activos}>
        <FiltrosVilla barrio={barrio} categoria={categoria} onBarrio={setBarrio} onCategoria={setCategoria} />
        <label className="etiqueta">
          Presupuesto mínimo (USDC)
          <input className="campo" inputMode="decimal" placeholder="Cualquiera" value={minimo} onChange={(e) => setMinimo(e.target.value)} />
        </label>
        <label className="etiqueta">
          Cierra
          <select className="campo" value={plazo} onChange={(e) => setPlazo(e.target.value)}>
            <option value="">Cuando sea</option>
            {[3, 7, 15, 30].map((d) => (
              <option key={d} value={d}>
                En los próximos {d} días
              </option>
            ))}
          </select>
        </label>
        <label className="etiqueta">
          Ordenar por
          <select className="campo" value={orden} onChange={(e) => setOrden(e.target.value as OrdenSeBusca)}>
            <option value="nuevos">Más nuevos</option>
            <option value="presupuesto">Mayor presupuesto</option>
            <option value="vence">Cierran antes</option>
            <option value="reputacion">Mejor reputación de quien publica</option>
          </select>
        </label>
        <SoloVerificados valor={verificados} onCambiar={setVerificados} />
      </Filtros>
      {error && <Aviso tipo="peligro">{error}</Aviso>}
      {!busquedas && !error && <Cargando />}
      {busquedas && (
        <p className="tablon-cuenta">
          {resultados.length} «Se busca» {resultados.length === 1 ? 'abierto' : 'abiertos'}
        </p>
      )}
      <ul className="afiches">
        {resultados.map((b) => {
          const tieneEdificio = edificios.some((e) => e.usuarioId === b.autor_id);
          return (
            <li key={b.id} className="afiche afiche-se-busca">
              <span className="afiche-chincheta" style={{ background: BARRIOS[b.barrio].color }} aria-hidden="true" />
              <button type="button" className="afiche-banda" onClick={() => abrir({ tipo: 'busqueda', id: b.id })} aria-label={`Ver el Se busca: ${b.titulo}`}>
                SE BUSCA
              </button>
              <b className="afiche-titulo">{b.titulo}</b>
              <span className="afiche-precio">hasta {b.presupuesto_usdc} USDC</span>
              <span className="fila pequeno afiche-persona">
                <Avatar frame={b.autor.avatar} apariencia={b.autor.apariencia} tamano={22} />
                <Nombre nombre={b.autor.nombre} verificado={b.autor.verificado} />
              </span>
              <span className="fila pequeno afiche-datos">
                <span className="chip" style={chipDe(b.barrio)}>
                  {nombreCategoria(b.categoria)}
                </span>
                <Estrellas valor={reputaciones.get(b.autor_id)?.calificacion ?? null} />
              </span>
              <span className="tenue pequeno">
                Villa {BARRIOS[b.barrio].nombre} · para el {fechaDia(b.fecha_limite)} · {b.total_propuestas} {b.total_propuestas === 1 ? 'propuesta' : 'propuestas'}
              </span>
              <span className="afiche-acciones">
                <button type="button" className="boton boton-mini boton-primario" onClick={() => abrir({ tipo: 'busqueda', id: b.id })}>
                  Ver el «Se busca»
                </button>
                {tieneEdificio && (
                  <button
                    type="button"
                    className="boton boton-mini"
                    onClick={() => {
                      cerrar();
                      irAlEdificio(b.autor_id);
                    }}
                  >
                    <Icono nombre="edificio" tamano={14} /> Ir a su edificio
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {busquedas && resultados.length === 0 && <p className="tablon-vacio">No hay «Se busca» abiertos con esos filtros.</p>}
    </div>
  );
}
