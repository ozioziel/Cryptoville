import { AVISO_ABOGADO, DOCUMENTOS_LEGALES, datosDocumento, type DatosDocumento, type DocumentoLegal } from '@cryptoville/shared';
import { useMemo, useState } from 'react';
import { leerDocumento, TEXTOS, trozos, valoresDeReglas, type Bloque } from '../../legal/documentos';
import { api, mensajeDeError } from '../../lib/api';
import { obtenerConfig, reglas } from '../../lib/config';
import { useEstado } from '../estado';
import { Aviso } from '../components/basicos';

/** Aviso en rojo: lo que necesita un abogado (en todos los documentos y reglas). */
export function AvisoAbogado({ texto }: { texto?: string }) {
  return (
    <div className="abogado" role="note">
      <strong>Necesita un abogado.</strong> {texto ? <span>{texto} </span> : null}
      <span className="abogado-aviso">{AVISO_ABOGADO}</span>
    </div>
  );
}

function Linea({ texto }: { texto: string }) {
  return (
    <>
      {trozos(texto).map((t, i) => {
        if (t.tipo === 'negrita') return <strong key={i}>{t.texto}</strong>;
        if (t.tipo === 'codigo') return <code key={i}>{t.texto}</code>;
        if (t.tipo === 'enlace') {
          return (
            <a key={i} href={t.url} target="_blank" rel="noreferrer noopener">
              {t.texto}
            </a>
          );
        }
        return <span key={i}>{t.texto}</span>;
      })}
    </>
  );
}

function BloqueLegal({ b }: { b: Bloque }) {
  switch (b.tipo) {
    case 'titulo':
      return b.nivel === 1 ? null : b.nivel === 2 ? <h3>{b.texto}</h3> : <h4>{b.texto}</h4>;
    case 'parrafo':
      return (
        <p>
          <Linea texto={b.texto} />
        </p>
      );
    case 'lista': {
      const items = b.items.map((t, i) => (
        <li key={i}>
          <Linea texto={t} />
        </li>
      ));
      return b.ordenada ? <ol className="lista-legal">{items}</ol> : <ul className="lista-legal">{items}</ul>;
    }
    case 'tabla':
      return (
        <table className="tabla-legal">
          <thead>
            <tr>
              {b.cabecera.map((c, i) => (
                <th key={i}>
                  <Linea texto={c} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.filas.map((f, i) => (
              <tr key={i}>
                {f.map((c, j) => (
                  <td key={j}>
                    <Linea texto={c} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case 'abogado':
      return <AvisoAbogado texto={b.texto} />;
  }
}

/** Un documento legal, con los números del archivo de reglas y lo que necesita un abogado en rojo. */
export function PanelLegal({ documento }: { documento: DocumentoLegal }) {
  const datos = datosDocumento(documento);
  const leido = useMemo(() => leerDocumento(TEXTOS[documento], valoresDeReglas(reglas(), obtenerConfig().red)), [documento]);
  return (
    <article className="pila documento-legal">
      {/* Todos los documentos son borradores hasta que los revise un abogado. */}
      <AvisoAbogado />
      <p className="tenue pequeno">Versión {leido.version ?? datos?.version}</p>
      {leido.bloques.map((b, i) => (
        <BloqueLegal key={i} b={b} />
      ))}
      <EnlacesLegales actual={documento} />
    </article>
  );
}

/** Enlaces a todos los documentos (en la bienvenida, el perfil y al pie de cada documento). */
export function EnlacesLegales({ actual }: { actual?: DocumentoLegal }) {
  const { abrir } = useEstado();
  return (
    <nav className="enlaces-legales" aria-label="Documentos legales">
      {DOCUMENTOS_LEGALES.filter((d) => d.id !== actual).map((d) => (
        <button key={d.id} type="button" className="enlace" onClick={() => abrir({ tipo: 'legal', documento: d.id })}>
          {d.titulo}
        </button>
      ))}
    </nav>
  );
}

/** Aceptar los documentos nuevos o que cambiaron (se pide al entrar). */
export function PanelAceptarLegal({ pendientes, onListo }: { pendientes: DatosDocumento[]; onListo: () => void }) {
  const { abrir } = useEstado();
  const [acepto, setAcepto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  return (
    <div className="pila">
      <p>Antes de seguir, lee y acepta estos documentos. Los puedes volver a abrir cuando quieras desde tu perfil.</p>
      <ul className="lista-tarjetas">
        {pendientes.map((d) => (
          <li key={d.id}>
            <button type="button" className="tarjeta" onClick={() => abrir({ tipo: 'legal', documento: d.id })}>
              <span className="tarjeta-titulo">{d.titulo}</span>
              <span className="tenue pequeno">Versión {d.version} · Leer</span>
            </button>
          </li>
        ))}
      </ul>
      <AvisoAbogado />
      <label className="casilla casilla-fila">
        <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} />
        <span>Leí y acepto estos documentos.</span>
      </label>
      <button
        type="button"
        className="boton boton-primario"
        disabled={!acepto || enviando}
        onClick={async () => {
          setError(null);
          setEnviando(true);
          try {
            await api('/legal/aceptar', { cuerpo: { documentos: pendientes.map((d) => ({ id: d.id, version: d.version })) } });
            onListo();
          } catch (e) {
            setError(mensajeDeError(e));
          } finally {
            setEnviando(false);
          }
        }}
      >
        {enviando ? 'Guardando…' : 'Aceptar y seguir'}
      </button>
      {error && <Aviso tipo="peligro">{error}</Aviso>}
    </div>
  );
}
