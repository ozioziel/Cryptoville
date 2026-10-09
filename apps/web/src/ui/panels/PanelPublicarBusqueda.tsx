import { BARRIOS, LIMITES_SE_BUSCA, LISTA_BARRIOS, esCategoriaDe, type Barrio } from '@cryptoville/shared';
import { useState } from 'react';
import { useSesion } from '../../features/auth/sesion';
import { emitir } from '../../game/EventBus';
import { api, mensajeDeError } from '../../lib/api';
import { useEstado } from '../estado';
import { Aviso } from '../components/basicos';

const DIA = 86_400_000;
/** Fecha para un <input type="date"> (en la hora local). */
const comoFecha = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Publicar un «Se busca»: lo que necesitas, para que los proveedores te manden propuestas. */
export function PanelPublicarBusqueda({ barrio: inicial }: { barrio: Barrio }) {
  const { usuario } = useSesion();
  const { abrir, cambiar, notificar, refrescar, modo } = useEstado();
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [barrio, setBarrio] = useState<Barrio>(inicial);
  const [categoria, setCategoria] = useState(BARRIOS[inicial].categorias[0].id);
  const [presupuesto, setPresupuesto] = useState('');
  const [fecha, setFecha] = useState(comoFecha(Date.now() + 14 * DIA));
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!usuario) {
    return (
      <div className="pila">
        <p>Entra con tu wallet para publicar lo que necesitas.</p>
        <button type="button" className="boton boton-primario" onClick={() => abrir({ tipo: 'bienvenida' })}>
          Entrar
        </button>
      </div>
    );
  }

  const listo =
    titulo.trim().length >= LIMITES_SE_BUSCA.tituloMin && descripcion.trim().length >= LIMITES_SE_BUSCA.detalleMin && Number(presupuesto) > 0 && !!fecha;

  const publicar = async () => {
    setError(null);
    setEnviando(true);
    try {
      // Hasta el final del día elegido, en la hora local.
      const [a, m, d] = fecha.split('-').map(Number);
      const limite = new Date(a, m - 1, d, 23, 59, 0).toISOString();
      const b = await api<{ id: string; barrio: Barrio; lote: number }>('/busquedas', {
        cuerpo: { titulo, descripcion, barrio, categoria, presupuesto_usdc: presupuesto.trim(), fecha_limite: limite },
      });
      notificar(
        'Publicaste tu «Se busca». Aparece como un cartel en «Quiero trabajar», donde lo ven los proveedores. Te avisamos cuando lleguen propuestas.',
        null,
        b.id,
      );
      refrescar();
      // En el modo «Quiero trabajar» su cartel aparece en la villa: se lleva al jugador frente a él.
      if (modo === 'trabajar') emitir('ir-a-local', { barrio: b.barrio, lote: b.lote });
      cambiar({ tipo: 'busqueda', id: b.id });
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="pila">
      <p className="tenue pequeno">Cuenta lo que necesitas: los proveedores de la villa te mandan sus propuestas y tú eliges una.</p>
      <label className="etiqueta" htmlFor="sb-titulo">
        ¿Qué necesitas?
      </label>
      <input
        id="sb-titulo"
        className="campo"
        maxLength={LIMITES_SE_BUSCA.tituloMax}
        placeholder="Por ejemplo: Logo para mi tienda"
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
      />
      <label className="etiqueta" htmlFor="sb-detalle">
        Cuéntalo con detalle
      </label>
      <textarea
        id="sb-detalle"
        className="campo"
        rows={4}
        maxLength={LIMITES_SE_BUSCA.detalleMax}
        placeholder="Qué esperas recibir, formatos, referencias…"
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
      />
      <label className="etiqueta" htmlFor="sb-villa">
        Villa
      </label>
      <select
        id="sb-villa"
        className="campo"
        value={barrio}
        onChange={(e) => {
          const b = e.target.value as Barrio;
          setBarrio(b);
          if (!esCategoriaDe(b, categoria)) setCategoria(BARRIOS[b].categorias[0].id);
        }}
      >
        {LISTA_BARRIOS.map((b) => (
          <option key={b} value={b}>
            {BARRIOS[b].nombre}: {BARRIOS[b].descripcion}
          </option>
        ))}
      </select>
      <label className="etiqueta" htmlFor="sb-categoria">
        Categoría
      </label>
      <select id="sb-categoria" className="campo" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
        {BARRIOS[barrio].categorias.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
      <div className="fila">
        <label className="etiqueta">
          Presupuesto (USDC)
          <input className="campo" inputMode="decimal" placeholder="40" value={presupuesto} onChange={(e) => setPresupuesto(e.target.value)} />
        </label>
        <label className="etiqueta">
          ¿Para cuándo?
          <input
            className="campo"
            type="date"
            min={comoFecha(Date.now() + DIA)}
            max={comoFecha(Date.now() + LIMITES_SE_BUSCA.diasMax * DIA - DIA)}
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </label>
      </div>
      <button type="button" className="boton boton-primario" disabled={!listo || enviando} onClick={publicar}>
        {enviando ? 'Publicando…' : 'Publicar «Se busca»'}
      </button>
      <span className="tenue pequeno">Publicarlo no cobra nada. Pagas en garantía recién cuando eliges una propuesta.</span>
      {error && <Aviso tipo="peligro">{error}</Aviso>}
    </div>
  );
}
