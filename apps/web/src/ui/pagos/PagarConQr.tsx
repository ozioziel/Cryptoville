import { ETIQUETA_ESTADO_RAMPA, RAMPA_SIMULADA, cotizarRampaSimulada, formatoUsdc } from '@cryptoville/shared';
import { useEffect, useState } from 'react';
import { clientePollar } from '../../features/auth/pollar';
import { useSesion } from '../../features/auth/sesion';
import { CanceladoPorUsuario } from '../../features/auth/wallet';
import { crearRecargaPollar, estadoRecargaPollar, hayRampaBolivia, type RecargaPollar } from '../../features/rampas/pollar';
import { avisarCambioDeSaldo, crearRecarga, faltaParaPagar, saldoUsdc, simularPagoDelBanco, type Rampa } from '../../features/rampas/datos';
import { mensajeDeError } from '../../lib/api';
import { obtenerConfig, servicios } from '../../lib/config';
import { Aviso, Copiar, fechaCorta } from '../components/basicos';
import { Icono } from '../components/Iconos';

/**
 * «Pagar con el QR de tu banco»: para quien no tiene USDC. Pasa bolivianos a USDC con una rampa y,
 * cuando llega el USDC a su wallet, la persona confirma el pago de siempre (garantía, etapas o directo).
 * - Rampa simulada (testnet): el QR es de mentira y hay un botón para simular el pago del banco.
 * - Rampa de Pollar (mainnet): el QR lo da el proveedor de cambio. SIN PROBAR (docs/simulaciones.md).
 */
export function PagarConQr({ montoUsdc, pedidoId, onAcreditada }: { montoUsdc: string; pedidoId?: string; onAcreditada?: () => void }) {
  const rampa = servicios().rampa;
  const { usuario, firmante } = useSesion();
  const direccion = firmante?.direccion ?? usuario?.direccion ?? '';
  const [saldo, setSaldo] = useState<string | null | undefined>(undefined);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    if (!rampa || !direccion) return;
    saldoUsdc(direccion).then(setSaldo, () => setSaldo(null));
  }, [rampa, direccion]);

  if (!rampa || !direccion) return null;
  const alcanza = saldo !== undefined && saldo !== null && Number(saldo) >= Number(montoUsdc);

  return (
    <div className="caja pila-compacta">
      {saldo !== undefined && saldo !== null && (
        <span className="pequeno">
          Tienes <strong>{formatoUsdc(saldo)} USDC</strong> en tu wallet{alcanza ? ': te alcanza para pagar.' : '.'}
        </span>
      )}
      {!abierto ? (
        <button type="button" className={alcanza ? 'boton boton-chico' : 'boton'} onClick={() => setAbierto(true)}>
          <Icono nombre="qr" /> {alcanza ? 'Prefiero pagar con el QR de mi banco' : '¿No tienes USDC? Paga con el QR de tu banco'}
        </button>
      ) : rampa === 'simulada' ? (
        <RecargaSimulada montoUsdc={faltaParaPagar(montoUsdc, alcanza ? '0' : saldo ?? null)} direccion={direccion} pedidoId={pedidoId} onAcreditada={onAcreditada} />
      ) : (
        <RecargaConPollar montoUsdc={faltaParaPagar(montoUsdc, alcanza ? '0' : saldo ?? null)} direccion={direccion} esPollar={firmante?.metodo === 'pollar'} onAcreditada={onAcreditada} />
      )}
    </div>
  );
}

function QrDeTexto({ texto }: { texto: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    void import('qrcode').then((QR) => QR.toString(texto, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 }).then(setSvg));
  }, [texto]);
  return svg ? <span className="qr-imagen" role="img" aria-label="Código QR para pagar desde el banco" dangerouslySetInnerHTML={{ __html: svg }} /> : null;
}

export function RecargaSimulada({ montoUsdc, direccion, pedidoId, onAcreditada }: { montoUsdc: string; direccion: string; pedidoId?: string; onAcreditada?: () => void }) {
  const [recarga, setRecarga] = useState<Rampa | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cotizacion = cotizarRampaSimulada('entrada', montoUsdc);

  const intentar = async (fn: () => Promise<void>) => {
    setError(null);
    setOcupado(true);
    try {
      await fn();
    } catch (e) {
      if (!(e instanceof CanceladoPorUsuario)) setError(mensajeDeError(e));
    } finally {
      setOcupado(false);
    }
  };

  if (!recarga) {
    return (
      <div className="pila-compacta">
        <p>
          Pagas <strong>Bs {cotizacion.monto_local}</strong> desde la app de tu banco y te llegan <strong>{montoUsdc} USDC</strong> a tu wallet.
        </p>
        <span className="tenue pequeno">
          Tipo de cambio Bs {cotizacion.tipo_cambio} por dólar · comisión del cambio Bs {cotizacion.comision_local}. El QR vale {RAMPA_SIMULADA.minutosVigencia}{' '}
          minutos.
        </span>
        <Aviso tipo="aviso">Modo de prueba: este QR es simulado. Ningún banco lo cobra y no se mueve dinero real.</Aviso>
        <button type="button" className="boton boton-primario" disabled={ocupado} onClick={() => intentar(async () => setRecarga(await crearRecarga(montoUsdc, direccion, pedidoId)))}>
          {ocupado ? 'Armando el QR…' : `Ver el QR para pagar Bs ${cotizacion.monto_local}`}
        </button>
        {error && <Aviso tipo="peligro">{error}</Aviso>}
      </div>
    );
  }

  const montoLocal = Number(recarga.monto_local).toFixed(2);
  return (
    <div className="pila-compacta qr-pago">
      <strong>{recarga.estado === 'acreditada' ? '¡Listo! Ya tienes tus USDC' : `Escanea con la app de tu banco: Bs ${montoLocal}`}</strong>
      {recarga.estado === 'esperando_pago' && recarga.qr_payload && <QrDeTexto texto={recarga.qr_payload} />}
      <span className="pequeno">
        Referencia <code>{recarga.referencia}</code> <Copiar texto={recarga.referencia} />
      </span>
      <span className="tenue pequeno">{ETIQUETA_ESTADO_RAMPA[recarga.estado]}{recarga.estado === 'esperando_pago' ? ` · vence ${fechaCorta(recarga.expira_en)}` : ''}</span>
      {recarga.estado === 'esperando_pago' && (
        <button
          type="button"
          className="boton boton-chico"
          disabled={ocupado}
          onClick={() =>
            intentar(async () => {
              const r = await simularPagoDelBanco(recarga.id);
              setRecarga(r);
              if (r.estado === 'acreditada') {
                avisarCambioDeSaldo();
                onAcreditada?.();
              }
            })
          }
        >
          {ocupado ? 'El banco está pagando…' : 'Simular el pago desde el banco (solo pruebas)'}
        </button>
      )}
      {recarga.estado === 'acreditada' && (
        <span className="pequeno">Llegaron {formatoUsdc(recarga.monto_usdc)} USDC a tu wallet. Ahora confirma el pago con el botón de arriba.</span>
      )}
      {(recarga.estado === 'vencida' || recarga.estado === 'fallida') && (
        <button type="button" className="boton boton-chico" onClick={() => setRecarga(null)}>
          Armar otro QR
        </button>
      )}
      {error && <Aviso tipo="peligro">{error}</Aviso>}
    </div>
  );
}

/** SIN PROBAR: rampa real de Pollar (mainnet). Necesita haber entrado con Google o con el correo. */
export function RecargaConPollar({ montoUsdc, direccion, esPollar, onAcreditada }: { montoUsdc: string; direccion: string; esPollar: boolean; onAcreditada?: () => void }) {
  const [recarga, setRecarga] = useState<RecargaPollar | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recarga || recarga.estado === 'completed' || recarga.estado === 'failed') return;
    const id = setInterval(() => {
      void (async () => {
        const c = await clientePollar(servicios().pollar_api_key!, obtenerConfig().red);
        const r = await estadoRecargaPollar(c, recarga.txId);
        setRecarga(r);
        if (r.estado === 'completed') onAcreditada?.();
      })().catch(() => undefined);
    }, 10_000);
    return () => clearInterval(id);
  }, [recarga, onAcreditada]);

  if (!esPollar) return <Aviso tipo="info">Para pagar con el QR de tu banco, entra con Google o con tu correo.</Aviso>;

  const empezar = async () => {
    setError(null);
    setOcupado(true);
    try {
      const c = await clientePollar(servicios().pollar_api_key!, obtenerConfig().red);
      const bolivia = await hayRampaBolivia(c);
      if (!bolivia) throw new Error('Todavía no hay un proveedor de cambio para Bolivia.');
      // El proveedor cotiza en la moneda local: se pide el equivalente aproximado y él da el monto exacto.
      const aproximado = Number(cotizarRampaSimulada('entrada', montoUsdc).monto_local);
      setRecarga(await crearRecargaPollar(c, aproximado, bolivia.moneda, direccion));
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setOcupado(false);
    }
  };

  if (!recarga) {
    return (
      <div className="pila-compacta">
        <button type="button" className="boton boton-primario" disabled={ocupado} onClick={empezar}>
          {ocupado ? 'Pidiendo el QR…' : 'Ver el QR para pagar desde mi banco'}
        </button>
        {error && <Aviso tipo="peligro">{error}</Aviso>}
      </div>
    );
  }
  return (
    <div className="pila-compacta qr-pago">
      {recarga.kycUrl && (
        <a className="boton" href={recarga.kycUrl} target="_blank" rel="noreferrer">
          Verifica tu identidad con el proveedor de cambio <Icono nombre="enlace" tamano={14} />
        </a>
      )}
      {recarga.qr && 'svg' in recarga.qr && <span className="qr-imagen" role="img" aria-label="Código QR para pagar desde el banco" dangerouslySetInnerHTML={{ __html: recarga.qr.svg }} />}
      {recarga.qr && 'src' in recarga.qr && <img className="qr-imagen" src={recarga.qr.src} alt="Código QR para pagar desde el banco" />}
      {recarga.campos.map((c) => (
        <span key={c.etiqueta} className="pequeno">
          {c.etiqueta}: <strong>{c.valor}</strong> {c.copiable && <Copiar texto={c.valor} />}
        </span>
      ))}
      <span className="tenue pequeno">
        {recarga.estado === 'completed' ? '¡Listo! Ya tienes tus USDC: confirma el pago con el botón de arriba.' : 'Esperando tu pago desde el banco…'}
      </span>
    </div>
  );
}
