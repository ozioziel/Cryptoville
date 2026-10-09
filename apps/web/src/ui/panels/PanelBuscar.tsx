import { BARRIOS, LISTA_BARRIOS, nombreCategoria, type Barrio } from '@cryptoville/shared';
import { useEffect, useMemo, useState } from 'react';
import { useSesion } from '../../features/auth/sesion';
import { cargarSeBusca, type BusquedaPublica } from '../../features/busquedas/datos';
import { filtrarSeBusca } from '../../features/busquedas/filtrar';
import { buscarServicios } from '../../features/services/buscar';
import { mensajeDeError } from '../../lib/api';
import { useEstado, type PestanaBuscar } from '../estado';
import { chipDe } from '../villas';
import { Aviso, Avatar, Cargando, Estrellas } from '../components/basicos';
import { CartelSeBusca } from '../components/Cartel';
import { Pestanas } from '../components/Editor';
import { Icono } from '../components/Iconos';

/**
 * Buscador con dos pestañas:
 * - "Servicios" (Quiero contratar): los servicios de los locales.
 * - "Se busca" (Quiero trabajar): lo que la gente necesita, en carteles.
 */
export function PanelBuscar({ pestana = 'servicios' }: { pestana?: PestanaBuscar }) {
  const { cambiar, cambiarModo } = useEstado();
  return (
    <div className="pila">
      <Pestanas
        etiqueta="Qué quieres hacer"
        opciones={[
          { id: 'servicios', nombre: 'Servicios' },
          { id: 'se-busca', nombre: 'Se busca' },
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
    <div className="fila">
      <select
        className="campo"
        value={barrio}
        onChange={(e) => {
          const b = e.target.value as Barrio | 'todos';
          onBarrio(b);
          if (b !== 'todos' && !BARRIOS[b].categorias.some((c) => c.id === categoria)) onCategoria('todas');
        }}
        aria-label="Villa"
      >
        <option value="todos">Todas las villas</option>
        {LISTA_BARRIOS.map((b) => (
          <option key={b} value={b}>
            Villa {BARRIOS[b].nombre}
          </option>
        ))}
      </select>
      <select className="campo" value={categoria} onChange={(e) => onCategoria(e.target.value)} aria-label="Categoría">
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
    </div>
  );
}

function BuscarServicios() {
  const { locales, abrir, cerrar, villa, irAlLocal } = useEstado();
  const [texto, setTexto] = useState('');
  const [barrio, setBarrio] = useState<Barrio | 'todos'>('todos');
  const [categoria, setCategoria] = useState<string>('todas');
  const [precio, setPrecio] = useState('');
  const resultados = useMemo(
    () => buscarServicios(locales, { texto, barrio, categoria, precioMaximo: precio ? Number(precio) : null }),
    [locales, texto, barrio, categoria, precio],
  );

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
          autoFocus
        />
      </div>
      <FiltrosVilla barrio={barrio} categoria={categoria} onBarrio={setBarrio} onCategoria={setCategoria} />
      <input className="campo" inputMode="decimal" placeholder="Precio máximo (USDC)" value={precio} onChange={(e) => setPrecio(e.target.value)} aria-label="Precio máximo en USDC" />
      <p className="tenue pequeno">
        {resultados.length} {resultados.length === 1 ? 'servicio' : 'servicios'}
      </p>
      <ul className="lista-tarjetas">
        {resultados.map(({ servicio, local }) => (
          <li key={servicio.id} className="tarjeta">
            <span className="fila espaciada">
              <span className="tarjeta-titulo">{servicio.titulo}</span>
              <span className="tarjeta-precio">{servicio.precio_usdc} USDC</span>
            </span>
            <span className="fila pequeno">
              <Avatar frame={local.usuario.avatar} apariencia={local.usuario.apariencia} tamano={22} /> {local.usuario.nombre} · Villa {BARRIOS[local.barrio].nombre} ·{' '}
              <Estrellas valor={local.reputacion?.calificacion ?? null} />
            </span>
            <span className="fila">
              <span className="chip" style={chipDe(local.barrio)}>
                {nombreCategoria(local.categoria)}
              </span>
            </span>
            <span className="fila">
              <button type="button" className="boton boton-mini" onClick={() => abrir({ tipo: 'servicio', servicioId: servicio.id })}>
                Ver servicio
              </button>
              <button
                type="button"
                className="boton boton-mini"
                onClick={() => {
                  cerrar();
                  irAlLocal(local);
                }}
              >
                Ir al local <Icono nombre="flecha" tamano={14} />
              </button>
            </span>
          </li>
        ))}
      </ul>
      {/* Si no está lo que necesita, puede publicarlo para que los proveedores le escriban. */}
      <div className="caja caja-aviso pila">
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
  const { abrir, version, villa } = useEstado();
  const { usuario } = useSesion();
  const [busquedas, setBusquedas] = useState<BusquedaPublica[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [barrio, setBarrio] = useState<Barrio | 'todos'>('todos');
  const [categoria, setCategoria] = useState<string>('todas');
  const [minimo, setMinimo] = useState('');

  useEffect(() => {
    cargarSeBusca().then(setBusquedas, (e) => setError(mensajeDeError(e)));
  }, [version]);

  const resultados = useMemo(
    () => filtrarSeBusca(busquedas ?? [], { texto, barrio, categoria, presupuestoMinimo: minimo ? Number(minimo) : null }),
    [busquedas, texto, barrio, categoria, minimo],
  );

  return (
    <div className="pila">
      <div className="fila espaciada">
        <span className="tenue pequeno">Lo que la gente necesita. Mándale tu propuesta.</span>
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
          autoFocus
        />
      </div>
      <FiltrosVilla barrio={barrio} categoria={categoria} onBarrio={setBarrio} onCategoria={setCategoria} />
      <input className="campo" inputMode="decimal" placeholder="Presupuesto mínimo (USDC)" value={minimo} onChange={(e) => setMinimo(e.target.value)} aria-label="Presupuesto mínimo en USDC" />
      {error && <Aviso tipo="peligro">{error}</Aviso>}
      {!busquedas && !error && <Cargando />}
      {busquedas && (
        <p className="tenue pequeno">
          {resultados.length} «Se busca» {resultados.length === 1 ? 'abierto' : 'abiertos'}
        </p>
      )}
      <ul className="lista-carteles">
        {resultados.map((b) => (
          <li key={b.id}>
            <CartelSeBusca busqueda={b} onAbrir={() => abrir({ tipo: 'busqueda', id: b.id })} />
          </li>
        ))}
      </ul>
      {busquedas && resultados.length === 0 && <p className="tenue">No hay «Se busca» abiertos con esos filtros.</p>}
    </div>
  );
}
