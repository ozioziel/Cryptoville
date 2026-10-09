import { RAMPA_SIMULADA, enlaceExplorador } from '@cryptoville/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSesion } from '../../features/auth/sesion';
import { escucharCambioDeSaldo, saldoUsdc } from '../../features/rampas/datos';
import { obtenerConfig, servicios } from '../../lib/config';
import { useEstado } from '../estado';
import { Aviso } from '../components/basicos';
import { Icono } from '../components/Iconos';
import { RecargaConPollar, RecargaSimulada } from './PagarConQr';

/** «12,50»: el saldo con dos decimales, a la manera de acá. */
function formatoSaldo(usdc: string): string {
  return Number(usdc).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** «1,2 mil»: para la barra del celular, donde no entra un número largo. */
function formatoCorto(usdc: string): string {
  const n = Number(usdc);
  return n < 1000 ? formatoSaldo(usdc) : n.toLocaleString('es', { notation: 'compact', maximumFractionDigits: 1 });
}

/**
 * El saldo de USDC de la wallet de la cuenta, arriba al lado del perfil. Al tocarlo, un menú:
 * recargar con el QR del banco, pasar al banco, copiar la dirección y verla en el explorador.
 * Si no se puede leer la red muestra «—» (sin error). Se vuelve a leer al pagar, recargar o retirar.
 */
export function SaldoArriba() {
  const { usuario } = useSesion();
  const { abrir, version, avisar } = useEstado();
  const [saldo, setSaldo] = useState<string | null | undefined>(undefined);
  const [menu, setMenu] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const direccion = usuario?.direccion ?? null;
  const rampa = servicios().rampa;

  const leer = useCallback(() => {
    if (!direccion) return;
    saldoUsdc(direccion).then(setSaldo, () => setSaldo(null));
  }, [direccion]);

  useEffect(() => {
    setSaldo(undefined);
    leer();
  }, [leer, version]);
  useEffect(() => escucharCambioDeSaldo(leer), [leer]);
  // Al volver a la pestaña también se actualiza (por si pagó desde otra wallet).
  useEffect(() => {
    const alVolver = () => document.visibilityState === 'visible' && leer();
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [leer]);
  // El menú se cierra al tocar afuera.
  useEffect(() => {
    if (!menu) return;
    const afuera = (e: PointerEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('pointerdown', afuera);
    return () => document.removeEventListener('pointerdown', afuera);
  }, [menu]);

  if (!usuario || !direccion) return null;
  const texto = saldo === undefined ? '…' : saldo === null ? '—' : formatoSaldo(saldo);
  const corto = saldo === undefined ? '…' : saldo === null ? '—' : formatoCorto(saldo);

  const elegir = (accion: () => void) => {
    setMenu(false);
    accion();
  };

  return (
    <div className="saldo" ref={caja}>
      <button
        type="button"
        className="pastilla saldo-boton"
        aria-haspopup="menu"
        aria-expanded={menu}
        onClick={() => setMenu((m) => !m)}
        title="Tu saldo en USDC"
        aria-label={`Tu saldo: ${texto} USDC`}
      >
        <strong className="saldo-largo">{texto}</strong>
        {corto !== texto && <strong className="saldo-corto">{corto}</strong>}
        <span className="saldo-unidad"> USDC</span>
      </button>
      {menu && (
        <div className="saldo-menu" role="menu">
          <p className="saldo-menu-titulo">
            Tienes <strong>{texto} USDC</strong>
            {obtenerConfig().red === 'testnet' && <span className="tenue pequeno"> (de prueba)</span>}
          </p>
          {rampa && (
            <>
              <button type="button" role="menuitem" className="saldo-opcion" onClick={() => elegir(() => abrir({ tipo: 'recargar' }))}>
                <Icono nombre="qr" /> Recargar con el QR de tu banco
              </button>
              <button type="button" role="menuitem" className="saldo-opcion" onClick={() => elegir(() => abrir({ tipo: 'retiro' }))}>
                <Icono nombre="subir" /> Pasar a mi banco
              </button>
            </>
          )}
          <button
            type="button"
            role="menuitem"
            className="saldo-opcion"
            onClick={() =>
              elegir(() => {
                void navigator.clipboard?.writeText(direccion).then(
                  () => avisar('Copiaste tu dirección', 'exito'),
                  () => avisar('No se pudo copiar: cópiala desde tu perfil', 'error'),
                );
              })
            }
          >
            <Icono nombre="copiar" /> Copiar mi dirección
          </button>
          <a
            role="menuitem"
            className="saldo-opcion"
            href={enlaceExplorador('account', direccion, obtenerConfig().red)}
            target="_blank"
            rel="noreferrer"
            onClick={() => setMenu(false)}
          >
            <Icono nombre="enlace" /> Ver en el explorador
          </a>
        </div>
      )}
    </div>
  );
}

/** «Recargar con el QR de tu banco» sin un pedido: elegir cuánto y pagar el QR (simulado en testnet). */
export function PanelRecargar() {
  const { usuario, firmante } = useSesion();
  const rampa = servicios().rampa;
  const [monto, setMonto] = useState('10');
  const [listo, setListo] = useState(false);
  const direccion = firmante?.direccion ?? usuario?.direccion ?? '';
  const valido = /^\d{1,4}(\.\d{1,2})?$/.test(monto) && Number(monto) >= RAMPA_SIMULADA.minimoUsdc && Number(monto) <= RAMPA_SIMULADA.maximoUsdc;

  if (!usuario) return <Aviso tipo="info">Entra para recargar tu saldo.</Aviso>;
  if (!rampa) return <Aviso tipo="info">Recargar con el QR del banco todavía no está disponible en este servidor.</Aviso>;

  return (
    <div className="pila">
      <p className="tenue">Elige cuánto USDC quieres y paga el QR desde la app de tu banco.</p>
      {!listo && (
        <>
          <label className="etiqueta" htmlFor="recarga-monto">
            Cuánto USDC
          </label>
          <input id="recarga-monto" className="campo" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value.trim())} />
          {!valido && (
            <span className="tenue pequeno">
              De {RAMPA_SIMULADA.minimoUsdc} a {RAMPA_SIMULADA.maximoUsdc} USDC, con hasta 2 decimales.
            </span>
          )}
        </>
      )}
      {valido &&
        (rampa === 'simulada' ? (
          <RecargaSimulada key={monto} montoUsdc={Number(monto).toFixed(2)} direccion={direccion} onAcreditada={() => setListo(true)} />
        ) : (
          <RecargaConPollar key={monto} montoUsdc={Number(monto).toFixed(2)} direccion={direccion} esPollar={firmante?.metodo === 'pollar'} onAcreditada={() => setListo(true)} />
        ))}
    </div>
  );
}
