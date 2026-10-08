import { enlaceExplorador, type Wallet } from '@cryptoville/shared';
import { useCallback, useEffect, useState } from 'react';
import { useSesion } from '../../features/auth/sesion';
import { CanceladoPorUsuario } from '../../features/auth/wallet';
import { api, mensajeDeError } from '../../lib/api';
import { obtenerConfig } from '../../lib/config';
import { useEstado } from '../estado';
import { Aviso, Cargando, Direccion } from '../components/basicos';
import { Icono } from '../components/Iconos';

const METODO: Record<Wallet['metodo'], string> = { wallet: 'Tu wallet', pollar: 'Cuenta con correo', 'llave-prueba': 'Llave de prueba' };

/**
 * Mis wallets: la cuenta es la persona y puede tener varias wallets.
 * Se entra con cualquiera; se elige en cuál cobrar; la wallet con la que se creó la cuenta no se quita.
 */
export function PanelWallets() {
  const { vincularWallet, firmante } = useSesion();
  const { avisar } = useEstado();
  const [wallets, setWallets] = useState<Wallet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const red = obtenerConfig().red;

  const cargar = useCallback(async () => {
    try {
      setWallets(await api<Wallet[]>('/wallets'));
    } catch (e) {
      setError(mensajeDeError(e));
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const hacer = async (fn: () => Promise<unknown>, exito: string) => {
    setError(null);
    setOcupado(true);
    try {
      await fn();
      await cargar();
      avisar(exito, 'exito');
    } catch (e) {
      if (!(e instanceof CanceladoPorUsuario)) setError(mensajeDeError(e));
    } finally {
      setOcupado(false);
    }
  };

  if (!wallets) return error ? <Aviso tipo="peligro">{error}</Aviso> : <Cargando />;
  return (
    <div className="pila">
      <p className="tenue">
        Tu cuenta es tuya, no de una wallet: puedes sumar varias y entrar con cualquiera. Si pierdes una, sigues entrando con las otras.
      </p>
      <ul className="lista-tarjetas">
        {wallets.map((w) => (
          <li key={w.id} className="tarjeta">
            <span className="fila espaciada">
              <Direccion valor={w.direccion} />
              <span className="fila chips">
                {w.de_la_cuenta && <span className="chip chip-info">De la cuenta</span>}
                {w.para_cobrar && <span className="chip chip-verde">Para cobrar</span>}
                {firmante?.direccion === w.direccion && <span className="chip chip-oro">Conectada</span>}
              </span>
            </span>
            <span className="tenue pequeno">
              {METODO[w.metodo]} ·{' '}
              <a href={enlaceExplorador('account', w.direccion, red)} target="_blank" rel="noreferrer noopener">
                Ver en el explorador <Icono nombre="enlace" tamano={13} />
              </a>
            </span>
            <span className="fila">
              {!w.para_cobrar && (
                <button type="button" className="boton boton-mini" disabled={ocupado} onClick={() => hacer(() => api(`/wallets/${w.id}/cobrar`, { cuerpo: {} }), 'Ahora cobras en esa wallet')}>
                  Cobrar aquí
                </button>
              )}
              {!w.de_la_cuenta && (
                <button type="button" className="boton boton-mini boton-peligro" disabled={ocupado} onClick={() => hacer(() => api(`/wallets/${w.id}`, { metodo: 'DELETE' }), 'Wallet quitada')}>
                  Quitar
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      <button type="button" className="boton" disabled={ocupado} onClick={() => hacer(vincularWallet, 'Wallet sumada a tu cuenta')}>
        <Icono nombre="mas" /> Sumar otra wallet
      </button>
      <p className="tenue pequeno">
        Para sumarla, elige la wallet en el selector y firma un mensaje: así probamos que es tuya. No mueve dinero.
      </p>
      {error && <Aviso tipo="peligro">{error}</Aviso>}
    </div>
  );
}
