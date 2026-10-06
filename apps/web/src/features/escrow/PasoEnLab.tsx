import { ERRORES_CONTRATO, esHashValido, type AccionContrato, type DefinicionAccion, type Parte } from '@cryptoville/shared';
import { useState } from 'react';
import { api, mensajeDeError } from '../../lib/api';
import { obtenerConfig } from '../../lib/config';
import { Aviso, Copiar } from '../../ui/components/basicos';
import { Icono } from '../../ui/components/Iconos';
import type { PedidoDetalle } from '../orders/datos';
import { argumentosPara } from './pasos';

/**
 * Un paso del contrato que se hace en Stellar Lab:
 * 1) abrir el contrato en el Lab, 2) elegir la función y copiar los valores,
 * 3) firmar y enviar con la wallet, 4) pegar aquí el hash de la transacción.
 */
export function PasoEnLab({
  pedido,
  def,
  miDireccion,
  onListo,
}: {
  pedido: PedidoDetalle;
  def: DefinicionAccion;
  miDireccion: string;
  onListo: () => void;
}) {
  const config = obtenerConfig();
  const accion = def.accion as AccionContrato;
  const [aFavorDe, setAFavorDe] = useState<Parte>('Cliente');
  const [motivo, setMotivo] = useState('');
  const [decision, setDecision] = useState('');
  const [hash, setHash] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  let argumentos: ReturnType<typeof argumentosPara> = [];
  let errorArgs: string | null = null;
  try {
    argumentos = argumentosPara(pedido, accion, miDireccion, config.arbitro, aFavorDe);
  } catch (e) {
    errorArgs = mensajeDeError(e);
  }

  const registrar = async () => {
    setError(null);
    setEnviando(true);
    try {
      await api(`/pedidos/${pedido.id}/pasos`, {
        cuerpo: {
          accion,
          hash: hash.trim(),
          ...(accion === 'abrir_disputa' ? { motivo } : {}),
          ...(accion === 'resolver' ? { a_favor_de: aFavorDe, decision } : {}),
        },
      });
      onListo();
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setEnviando(false);
    }
  };

  const listo =
    esHashValido(hash) &&
    (accion !== 'abrir_disputa' || motivo.trim().length >= 10) &&
    (accion !== 'resolver' || decision.trim().length >= 10);

  return (
    <div className="paso-lab">
      <p>{def.ayuda}</p>
      {!config.contrato_url ? (
        <Aviso tipo="aviso">
          El contrato todavía no está configurado en este servidor (falta <code>ESCROW_CONTRACT_ID</code>). Ver docs/guia-stellar-lab.md.
        </Aviso>
      ) : (
        <ol className="lista-pasos">
          <li>
            <a className="boton boton-primario" href={config.contrato_url} target="_blank" rel="noreferrer">
              Abrir el contrato en Stellar Lab <Icono nombre="enlace" tamano={16} />
            </a>
            <span className="tenue pequeno"> Pestaña «Invoke contract», conecta tu wallet.</span>
          </li>
          <li>
            Busca la función <code>{accion}</code> y escribe estos valores:
            {accion === 'resolver' && (
              <div className="fila">
                <label className="etiqueta">A favor de:</label>
                <select className="campo" value={aFavorDe} onChange={(e) => setAFavorDe(e.target.value as Parte)}>
                  <option value="Cliente">Cliente ({pedido.cliente.nombre})</option>
                  <option value="Proveedor">Proveedor ({pedido.proveedor.nombre})</option>
                </select>
              </div>
            )}
            {errorArgs ? (
              <Aviso tipo="peligro">{errorArgs}</Aviso>
            ) : (
              <table className="tabla-args">
                <tbody>
                  {argumentos.map((a) => (
                    <tr key={a.nombre}>
                      <th>
                        {a.nombre} <span className="tenue">({a.tipo})</span>
                      </th>
                      <td>
                        <code className="valor">{a.valor}</code>
                        <div className="tenue pequeno">{a.ayuda}</div>
                      </td>
                      <td>
                        <Copiar texto={a.valor} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </li>
          <li>Pulsa «Simulate & submit», firma con tu wallet y copia el hash de la transacción.</li>
          <li>
            Pega el hash aquí:
            <input
              className="campo"
              placeholder="64 caracteres, por ejemplo 6a274e17…"
              value={hash}
              onChange={(e) => setHash(e.target.value.trim())}
              spellCheck={false}
            />
          </li>
        </ol>
      )}
      {accion === 'abrir_disputa' && (
        <>
          <label className="etiqueta" htmlFor="motivo">
            Motivo de la disputa (lo lee el árbitro)
          </label>
          <textarea id="motivo" className="campo" rows={3} maxLength={1000} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </>
      )}
      {accion === 'resolver' && (
        <>
          <label className="etiqueta" htmlFor="decision">
            Explicación de la decisión (la ven las dos partes)
          </label>
          <textarea id="decision" className="campo" rows={3} maxLength={1000} value={decision} onChange={(e) => setDecision(e.target.value)} />
        </>
      )}
      <button type="button" className="boton boton-primario" disabled={!listo || enviando || !config.contrato_url} onClick={registrar}>
        {enviando ? 'Registrando…' : 'Ya lo hice: registrar el paso'}
      </button>
      <details className="pequeno">
        <summary>¿El Lab mostró un error?</summary>
        <ul className="lista-simple">
          {Object.entries(ERRORES_CONTRATO).map(([codigo, e]) => (
            <li key={codigo}>
              <code>Error #{codigo}</code> {e.nombre}: {e.explicacion}
            </li>
          ))}
        </ul>
      </details>
      {error && <Aviso tipo="peligro">{error}</Aviso>}
    </div>
  );
}
