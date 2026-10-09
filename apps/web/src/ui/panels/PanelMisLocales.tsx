import { BARRIOS, enlaceContrato, esHashValido, loteEnSector, nombreSector, sectorDeLote, usdcAUnidades, type Local } from '@cryptoville/shared';
import { useEffect, useState } from 'react';
import { useSesion } from '../../features/auth/sesion';
import { FirmarEnApp } from '../../features/escrow/FirmarEnApp';
import { api, mensajeDeError } from '../../lib/api';
import { obtenerConfig, reglas } from '../../lib/config';
import { useEstado } from '../estado';
import { Aviso, Cargando, Copiar } from '../components/basicos';
import { Icono } from '../components/Iconos';
import { ServiciosDelLocal } from './PanelMiLocal';

/** Lo que devuelve GET /api/mis-locales (ver CupoLocales en la API). */
interface Cupo {
  total: number;
  gratis: number;
  maximo: number;
  precio_extra_usdc: string;
  pagos_disponibles: number;
  puede_abrir: boolean;
  necesita_pago: boolean;
  pago_disponible: boolean;
  tesoreria: string | null;
  token: string | null;
}

/** «Villa Creativo B · casa 12»: dónde está la casa (el sector sale del lote, así nunca se mueve). */
export function ubicacionLocal(l: Pick<Local, 'barrio' | 'lote'>): string {
  const porSector = reglas().villa.casasPorSector;
  return `Villa ${nombreSector(BARRIOS[l.barrio].nombre, sectorDeLote(l.lote, porSector))} · casa ${loteEnSector(l.lote, porSector)}`;
}

/**
 * «Eliminar local» (lo archiva la API): pide confirmación, explica qué pasa y avisa si hay pedidos en curso.
 * Se usa en «Mis locales» y en «Editar» dentro del local.
 */
export function BotonEliminarLocal({ local, onEliminado }: { local: Pick<Local, 'id' | 'nombre'>; onEliminado?: () => void }) {
  const { recargar, locales: mios } = useSesion();
  const { recargarPueblo, avisar } = useEstado();
  const [ocupado, setOcupado] = useState(false);

  const eliminar = async () => {
    const ultimo = mios.length === 1;
    const confirmado = window.confirm(
      `¿Eliminar «${local.nombre}»?\n\nDeja de verse en la villa y libera su lote. Sus servicios se desactivan y los pedidos terminados siguen en tu historial.` +
        (ultimo ? '\n\nEs tu único local: también se va tu edificio de la Plaza principal, y para ofrecer servicios tendrás que abrir otro.' : ''),
    );
    if (!confirmado) return;
    setOcupado(true);
    try {
      const r = await api<{ propuestas_retiradas: number }>(`/locales/${local.id}`, { metodo: 'DELETE' });
      await Promise.all([recargar(), recargarPueblo()]);
      avisar(
        r.propuestas_retiradas
          ? `Eliminaste «${local.nombre}». También se retiraron ${r.propuestas_retiradas === 1 ? 'su propuesta enviada' : `sus ${r.propuestas_retiradas} propuestas enviadas`}.`
          : `Eliminaste «${local.nombre}»`,
        'exito',
      );
      onEliminado?.();
    } catch (e) {
      avisar(mensajeDeError(e), 'error');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <button type="button" className="boton boton-mini boton-peligro" disabled={ocupado} onClick={eliminar}>
      {ocupado ? 'Eliminando…' : 'Eliminar'}
    </button>
  );
}

/** Mis locales: la lista, cuántos quedan gratis y el pago único del local extra. */
export function PanelMisLocales() {
  const { usuario, locales: mios, recargar } = useSesion();
  const { locales, abrir, cerrar, irAlLocal } = useEstado();
  const [cupo, setCupo] = useState<Cupo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);

  const cargar = async () => {
    try {
      const r = await api<{ cupo: Cupo }>('/mis-locales');
      setCupo(r.cupo);
    } catch (e) {
      setError(mensajeDeError(e));
    }
  };
  useEffect(() => {
    void cargar();
  }, []);

  if (!usuario) return <p className="tenue">Entra para ver tus locales.</p>;

  return (
    <div className="pila">
      {cupo && (
        <p className="tenue">
          Tienes {cupo.total} de {cupo.maximo} locales. Los primeros {cupo.gratis} son gratis.
        </p>
      )}
      {mios.length === 0 && <p className="tenue">Todavía no tienes locales.</p>}
      <ul className="lista-tarjetas">
        {mios.map((l, i) => {
          const servicios = locales.find((x) => x.id === l.id)?.servicios.length ?? 0;
          return (
            <li key={l.id} className="servicio tarjeta-local">
              <span className="tarjeta-local-color" style={{ background: l.color }} aria-hidden="true" />
              <span className="servicio-texto">
                <b>{l.nombre}</b>
                <span className="tenue pequeno">
                  {ubicacionLocal(l)} · {servicios} {servicios === 1 ? 'servicio' : 'servicios'}
                  {i === 0 && ' · principal'}
                </span>
                {!l.activo && <span className="badge badge-apagado">Cerrado</span>}
              </span>
              <span className="fila">
                <button type="button" className="boton boton-mini" onClick={() => abrir({ tipo: 'mi-local', localId: l.id })}>
                  <Icono nombre="editar" tamano={14} /> Editar
                </button>
                <button
                  type="button"
                  className="boton boton-mini"
                  onClick={() => {
                    irAlLocal(l);
                    cerrar();
                  }}
                >
                  Ir
                </button>
                <button
                  type="button"
                  className="boton boton-mini"
                  aria-expanded={abierto === l.id}
                  onClick={() => setAbierto(abierto === l.id ? null : l.id)}
                >
                  Servicios
                </button>
                <BotonEliminarLocal local={l} onEliminado={() => void cargar()} />
              </span>
              {abierto === l.id && (
                <div className="servicios-del-local">
                  <ServiciosDelLocal localId={l.id} />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {!cupo && !error && <Cargando />}
      {cupo && !cupo.puede_abrir && <Aviso>Llegaste al máximo de {cupo.maximo} locales.</Aviso>}
      {cupo?.puede_abrir && !cupo.necesita_pago && (
        <button type="button" className="boton boton-primario" onClick={() => abrir({ tipo: 'mi-local', localId: mios.length ? 'nuevo' : undefined })}>
          <Icono nombre="mas" /> {mios.length ? 'Abrir otro local' : 'Abrir mi local'}
        </button>
      )}
      {cupo?.puede_abrir && cupo.necesita_pago && (
        <PagoLocalExtra
          cupo={cupo}
          onPagado={async () => {
            await Promise.all([cargar(), recargar()]);
          }}
        />
      )}
      {error && <Aviso tipo="peligro">{error}</Aviso>}
    </div>
  );
}

/** El pago único del local extra: con la wallet dentro de la app o, si no, desde Stellar Lab pegando el hash. */
function PagoLocalExtra({ cupo, onPagado }: { cupo: Cupo; onPagado: () => Promise<void> }) {
  const { usuario } = useSesion();
  const { avisar } = useEstado();
  const config = obtenerConfig();
  const [hash, setHash] = useState('');
  const [direccion, setDireccion] = useState(usuario?.direccion ?? '');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!cupo.pago_disponible || !cupo.tesoreria || !cupo.token) {
    return <Aviso>Ya usaste tus {cupo.gratis} locales gratis. El pago de locales extra todavía no está activo en este servidor.</Aviso>;
  }

  const declarar = async () => {
    setError(null);
    setEnviando(true);
    try {
      await api('/locales/pago', { cuerpo: { hash: hash.trim().toLowerCase(), direccion: direccion.trim() } });
      avisar('Pago registrado: ya puedes abrir otro local', 'exito');
      setHash('');
      await onPagado();
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="caja pila-compacta">
      <strong>Abrir otro local</strong>
      <p className="pequeno">
        Ya usaste tus {cupo.gratis} locales gratis. Cada local extra cuesta <b>{cupo.precio_extra_usdc} USDC</b>, una sola vez, y el pago va a la
        tesorería de WorkVille.
      </p>
      <FirmarEnApp tipo="pago_local" etiqueta="Pago del local extra" texto={`Pagar ${cupo.precio_extra_usdc} USDC con mi wallet`} onListo={() => void onPagado()} />
      <details>
        <summary>¿Pagaste desde Stellar Lab u otra wallet?</summary>
        <div className="pila-compacta">
          <p className="tenue pequeno">
            Llama a <code>transfer</code> en el contrato del USDC con estos datos y pega aquí el hash de la transacción:
          </p>
          <dl className="datos-copiar">
            <dt>Contrato del USDC</dt>
            <dd>
              <code>{cupo.token}</code> <Copiar texto={cupo.token} />{' '}
              <a href={enlaceContrato(cupo.token, config.red)} target="_blank" rel="noopener noreferrer">
                Abrir en Stellar Lab
              </a>
            </dd>
            <dt>from</dt>
            <dd>Tu wallet</dd>
            <dt>to (tesorería)</dt>
            <dd>
              <code>{cupo.tesoreria}</code> <Copiar texto={cupo.tesoreria} />
            </dd>
            <dt>amount</dt>
            <dd>
              <code>{usdcAUnidades(cupo.precio_extra_usdc)}</code> <Copiar texto={usdcAUnidades(cupo.precio_extra_usdc)} />{' '}
              <span className="tenue pequeno">({cupo.precio_extra_usdc} USDC con 7 decimales)</span>
            </dd>
          </dl>
          <label className="etiqueta" htmlFor="pago-direccion">
            Wallet que pagó
          </label>
          <input id="pago-direccion" className="campo" value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="G…" />
          <label className="etiqueta" htmlFor="pago-hash">
            Hash de la transacción
          </label>
          <input id="pago-hash" className="campo" value={hash} onChange={(e) => setHash(e.target.value)} placeholder="64 caracteres (0-9, a-f)" />
          <button type="button" className="boton" disabled={enviando || !esHashValido(hash.trim()) || !/^G[A-Z2-7]{55}$/.test(direccion.trim())} onClick={declarar}>
            {enviando ? 'Revisando…' : 'Registrar el pago'}
          </button>
          {error && <Aviso tipo="peligro">{error}</Aviso>}
        </div>
      </details>
    </div>
  );
}
