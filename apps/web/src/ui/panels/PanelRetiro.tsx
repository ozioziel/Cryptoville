import { RAMPA_SIMULADA, cotizarRampaSimulada, formatoUsdc } from '@cryptoville/shared';
import { useEffect, useState } from 'react';
import { useSesion } from '../../features/auth/sesion';
import { FirmarEnApp } from '../../features/escrow/FirmarEnApp';
import { crearRetiro, saldoUsdc, type Rampa } from '../../features/rampas/datos';
import { mensajeDeError } from '../../lib/api';
import { servicios } from '../../lib/config';
import { Aviso } from '../components/basicos';

/** USDC mayor que 0, hasta 7 decimales (como la API). */
const MONTO_VALIDO_USDC = /^(?=.*[1-9])\d{1,9}(\.\d{1,7})?$/;

/**
 * «Pasar a mi banco»: USDC de la wallet → bolivianos en la cuenta del banco, con una rampa.
 * En testnet la rampa es SIMULADA: el USDC de prueba se manda de verdad (a la rampa de mentira),
 * pero ningún banco recibe nada. Con Pollar (mainnet) todavía no está hecho: docs/simulaciones.md.
 */
export function PanelRetiro() {
  const rampa = servicios().rampa;
  const { usuario, firmante } = useSesion();
  const direccion = firmante?.direccion ?? usuario?.direccion ?? '';
  const [saldo, setSaldo] = useState<string | null | undefined>(undefined);
  const [monto, setMonto] = useState('');
  const [banco, setBanco] = useState<string>(RAMPA_SIMULADA.bancos[0]);
  const [cuenta, setCuenta] = useState('');
  const [retiro, setRetiro] = useState<Rampa | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (direccion) saldoUsdc(direccion).then(setSaldo, () => setSaldo(null));
  }, [direccion, enviado]);

  if (!usuario) return <Aviso tipo="info">Entra para pasar tu saldo a tu banco.</Aviso>;
  if (rampa !== 'simulada') {
    return <Aviso tipo="info">Pasar a tu banco todavía no está disponible en este servidor.</Aviso>;
  }

  const montoValido = MONTO_VALIDO_USDC.test(monto) && Number(monto) >= RAMPA_SIMULADA.minimoUsdc && Number(monto) <= RAMPA_SIMULADA.maximoUsdc;
  const alcanza = saldo === null || saldo === undefined || Number(monto) <= Number(saldo);
  const cotizacion = montoValido ? cotizarRampaSimulada('salida', monto) : null;

  const continuar = async () => {
    setError(null);
    setOcupado(true);
    try {
      setRetiro(await crearRetiro({ monto_usdc: monto, direccion, banco, cuenta: cuenta.trim() }));
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setOcupado(false);
    }
  };

  if (retiro && enviado) {
    return (
      <div className="pila">
        <Aviso tipo="exito">
          Listo: mandaste {formatoUsdc(retiro.monto_usdc)} USDC. Te llegan <strong>Bs {Number(retiro.monto_local).toFixed(2)}</strong> a tu cuenta de{' '}
          {retiro.banco} terminada en {retiro.cuenta_final}.
        </Aviso>
        <Aviso tipo="aviso">Modo de prueba: el retiro es simulado. Ningún banco recibe dinero real.</Aviso>
        <span className="tenue pequeno">Referencia {retiro.referencia}</span>
      </div>
    );
  }

  if (retiro) {
    return (
      <div className="pila">
        <p>
          Vas a mandar <strong>{formatoUsdc(retiro.monto_usdc)} USDC</strong> y te llegan <strong>Bs {Number(retiro.monto_local).toFixed(2)}</strong> a tu cuenta de{' '}
          {retiro.banco} terminada en {retiro.cuenta_final}.
        </p>
        <FirmarEnApp tipo="retiro_rampa" etiqueta="Retiro al banco" texto="Firmar y mandar" extra={{ rampa_id: retiro.id }} onListo={() => setEnviado(true)} />
        <button type="button" className="boton boton-chico" onClick={() => setRetiro(null)}>
          Cambiar los datos
        </button>
      </div>
    );
  }

  return (
    <div className="pila">
      <p className="tenue">Pasa el USDC de tu wallet a tu cuenta del banco, en bolivianos.</p>
      <Aviso tipo="aviso">Modo de prueba: el banco y el cambio son simulados. No se mueve dinero real.</Aviso>
      {saldo !== undefined && saldo !== null && (
        <span>
          Tienes <strong>{formatoUsdc(saldo)} USDC</strong>.
        </span>
      )}
      <label className="etiqueta" htmlFor="retiro-monto">
        Cuánto USDC
      </label>
      <input id="retiro-monto" className="campo" inputMode="decimal" placeholder="Por ejemplo, 10" value={monto} onChange={(e) => setMonto(e.target.value.trim())} />
      {montoValido && !alcanza && <span className="pequeno">No te alcanza: tienes {formatoUsdc(saldo ?? '0')} USDC.</span>}
      <label className="etiqueta" htmlFor="retiro-banco">
        Banco
      </label>
      <select id="retiro-banco" className="campo" value={banco} onChange={(e) => setBanco(e.target.value)}>
        {RAMPA_SIMULADA.bancos.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>
      <label className="etiqueta" htmlFor="retiro-cuenta">
        Número de cuenta
      </label>
      <input id="retiro-cuenta" className="campo" inputMode="numeric" value={cuenta} onChange={(e) => setCuenta(e.target.value.replace(/\D/g, ''))} />
      <span className="tenue pequeno">WorkVille solo guarda los últimos 4 dígitos.</span>
      {cotizacion && (
        <span>
          Te llegan <strong>Bs {cotizacion.monto_local}</strong> (cambio Bs {cotizacion.tipo_cambio} por dólar, comisión Bs {cotizacion.comision_local}).
        </span>
      )}
      <button type="button" className="boton boton-primario" disabled={ocupado || !montoValido || !alcanza || !/^\d{6,20}$/.test(cuenta)} onClick={continuar}>
        {ocupado ? 'Preparando…' : 'Continuar'}
      </button>
      {error && <Aviso tipo="peligro">{error}</Aviso>}
    </div>
  );
}
