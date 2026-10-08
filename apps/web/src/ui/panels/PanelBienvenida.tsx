import { useState } from 'react';
import { useSesion } from '../../features/auth/sesion';
import { CanceladoPorUsuario } from '../../features/auth/wallet';
import { mensajeDeError } from '../../lib/api';
import { obtenerConfig } from '../../lib/config';
import { Aviso, Garantia } from '../components/basicos';
import { LogoIcono } from '../components/Iconos';

/** Qué es WorkVille y cómo entrar con la wallet. */
export function PanelBienvenida({ onListo }: { onListo: () => void }) {
  const { usuario, entrarConWallet, entrarConSecreta } = useSesion();
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [secreta, setSecreta] = useState('');
  const config = obtenerConfig();

  const intentar = async (fn: () => Promise<void>) => {
    setError(null);
    setOcupado(true);
    try {
      await fn();
      onListo();
    } catch (e) {
      if (!(e instanceof CanceladoPorUsuario)) setError(mensajeDeError(e));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="pila">
      <div className="bienvenida-cabecera">
        <LogoIcono tamano={88} />
        <div>
          <p className="bienvenida-marca">WorkVille</p>
          <p className="bienvenida-lema">Talento y aprendizaje, en una sola villa.</p>
        </div>
      </div>
      <p className="destacado">
        Explora los barrios, encuentra profesionales y contrata sus servicios con pago <strong>en garantía</strong> con Stellar.
      </p>
      <ol className="lista-pasos">
        <li>Camina por las villas (flechas o WASD; en el celular, el joystick) y entra a los locales con <kbd>E</kbd>.</li>
        <li>Pide un servicio. Cuando el proveedor acepta, pagas en garantía desde Stellar Lab.</li>
        <li>El contrato guarda el dinero hasta que confirmas la entrega. Si hay un problema, decide el árbitro.</li>
      </ol>
      <Garantia />
      {config.red === 'testnet' && (
        <Aviso tipo="aviso">Estás en <strong>testnet</strong>: el dinero es de prueba (USDC de prueba), no tiene valor real.</Aviso>
      )}
      {usuario ? (
        <button type="button" className="boton boton-primario" onClick={onListo}>
          Explorar el pueblo
        </button>
      ) : (
        <>
          <button type="button" className="boton boton-primario" disabled={ocupado} onClick={() => intentar(entrarConWallet)}>
            {ocupado ? 'Esperando a tu wallet…' : 'Entrar con mi wallet'}
          </button>
          <p className="tenue pequeno">
            Solo firmas un mensaje para demostrar que la wallet es tuya: no mueve dinero ni autoriza pagos. Funciona con Freighter, xBull,
            Lobstr y otras.
          </p>
          <button type="button" className="boton" onClick={onListo}>
            Solo mirar el pueblo
          </button>
          {import.meta.env.DEV && (
            <details className="caja caja-info">
              <summary>Modo desarrollo: entrar con una llave de prueba</summary>
              <p className="pequeno">
                Pega la llave secreta (S…) de una wallet de ejemplo de <code>.seed-keys.json</code>. Solo testnet; esta opción no existe en
                producción.
              </p>
              <input
                type="password"
                className="campo"
                placeholder="S…"
                value={secreta}
                onChange={(e) => setSecreta(e.target.value)}
                autoComplete="off"
              />
              <button type="button" className="boton" disabled={ocupado || !secreta} onClick={() => intentar(() => entrarConSecreta(secreta))}>
                Entrar
              </button>
            </details>
          )}
        </>
      )}
      {error && <Aviso tipo="peligro">{error}</Aviso>}
    </div>
  );
}
