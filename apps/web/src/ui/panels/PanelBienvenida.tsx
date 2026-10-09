import { useState } from 'react';
import { cancelarEntradaConGoogle } from '../../features/auth/pollar';
import { useSesion } from '../../features/auth/sesion';
import { CanceladoPorUsuario } from '../../features/auth/wallet';
import { mensajeDeError } from '../../lib/api';
import { obtenerConfig, servicios } from '../../lib/config';
import { useEstado } from '../estado';
import { Aviso, Garantia } from '../components/basicos';
import { LogoIcono } from '../components/Iconos';
import { EnlacesLegales } from './PanelLegal';

/** Qué es WorkVille y cómo entrar: con el correo (para quien no conoce cripto) o con una wallet. */
export function PanelBienvenida({ onListo }: { onListo: () => void }) {
  const { usuario, entrarConWallet, entrarConGoogle, entrarConSecreta, pedirCodigo, confirmarCodigo, pasoCorreo } = useSesion();
  const { abrir } = useEstado();
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [conWallet, setConWallet] = useState(false);
  const [secreta, setSecreta] = useState('');
  const [correo, setCorreo] = useState('');
  const [codigo, setCodigo] = useState('');
  const [conCorreo, setConCorreo] = useState(false);
  const [conGoogle, setConGoogle] = useState(false);
  const config = obtenerConfig();
  const hayCorreo = Boolean(servicios().pollar_api_key);
  // «Entrar con Google» está apagado hasta probarlo con Pollar (POLLAR_GOOGLE=si; ver docs/simulaciones.md).
  const hayGoogle = hayCorreo && Boolean(servicios().pollar_google);

  const intentar = async (fn: () => Promise<void>, terminar = true) => {
    setError(null);
    setOcupado(true);
    try {
      await fn();
      if (terminar) onListo();
    } catch (e) {
      if (!(e instanceof CanceladoPorUsuario)) setError(mensajeDeError(e));
    } finally {
      setOcupado(false);
    }
  };

  const esperandoCodigo = pasoCorreo.paso === 'codigo' || pasoCorreo.paso === 'verificando';

  return (
    <div className="pila">
      <div className="bienvenida-cabecera">
        <LogoIcono tamano={88} />
        <p className="destacado">
          Un pueblo donde las personas ofrecen sus servicios, los encuentran y se pagan <strong>en garantía</strong> con Stellar.
        </p>
      </div>
      <ol className="lista-pasos">
        <li>Camina por las villas (flechas o WASD; en el celular, el joystick) y entra a los locales con <kbd>E</kbd>.</li>
        <li>Pide un servicio. Cuando el proveedor acepta, eliges cómo pagar: directo, con garantía o por etapas.</li>
        <li>Con garantía, el contrato guarda el dinero hasta que confirmas la entrega. Si hay un problema, decide el árbitro.</li>
      </ol>
      <Garantia />
      {config.red === 'testnet' && (
        <Aviso tipo="aviso">
          Estás en <strong>testnet</strong>: el dinero es de prueba (USDC de prueba), no tiene valor real.
        </Aviso>
      )}
      {usuario ? (
        <button type="button" className="boton boton-primario" onClick={onListo}>
          Explorar el pueblo
        </button>
      ) : (
        <>
          {hayGoogle && (
            <>
              <button
                type="button"
                className="boton boton-primario boton-grande"
                disabled={ocupado}
                onClick={() => {
                  setConGoogle(true);
                  void intentar(entrarConGoogle).finally(() => setConGoogle(false));
                }}
              >
                {ocupado && conGoogle ? 'Esperando a Google…' : 'Entrar con Google'}
              </button>
              {ocupado && conGoogle && (
                <p className="tenue pequeno">
                  ¿No se abrió la ventana de Google? Revisa que el navegador permita ventanas emergentes para este sitio.{' '}
                  <button type="button" className="enlace" onClick={cancelarEntradaConGoogle}>
                    Cancelar
                  </button>
                </p>
              )}
              <p className="tenue pequeno">
                Te creamos una cuenta con su propia wallet de Stellar. No tienes que anotar ninguna clave: la guarda nuestro proveedor de cuentas
                (Pollar), nunca WorkVille.
              </p>
            </>
          )}
          {hayCorreo && !conCorreo && (
            <button type="button" className={hayGoogle ? 'boton' : 'boton boton-primario boton-grande'} disabled={ocupado} onClick={() => setConCorreo(true)}>
              Entrar con tu correo
            </button>
          )}
          {hayCorreo && conCorreo && (
            <div className="caja caja-info pila">
              {!esperandoCodigo ? (
                <form
                  className="pila"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void intentar(() => pedirCodigo(correo), false);
                  }}
                >
                  <label className="etiqueta" htmlFor="correo">
                    Tu correo
                  </label>
                  <input
                    id="correo"
                    type="email"
                    className="campo"
                    autoComplete="email"
                    placeholder="tu@correo.com"
                    value={correo}
                    onChange={(e) => setCorreo(e.target.value)}
                  />
                  <button type="submit" className="boton boton-primario" disabled={ocupado || !/^\S+@\S+\.\S+$/.test(correo) || pasoCorreo.paso === 'enviando'}>
                    {pasoCorreo.paso === 'enviando' ? 'Enviando el código…' : 'Enviarme un código'}
                  </button>
                  <p className="tenue pequeno">
                    {hayGoogle
                      ? 'Te mandamos un código de un solo uso a tu correo.'
                      : 'Te creamos una cuenta con su propia wallet de Stellar. No tienes que anotar ninguna clave: la guarda nuestro proveedor de cuentas (Pollar), nunca WorkVille.'}
                  </p>
                </form>
              ) : (
                <form
                  className="pila"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void intentar(() => confirmarCodigo(codigo));
                  }}
                >
                  <label className="etiqueta" htmlFor="codigo">
                    Código que te llegó a {correo}
                  </label>
                  <input
                    id="codigo"
                    className="campo"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                  />
                  <button type="submit" className="boton boton-primario" disabled={ocupado || codigo.trim().length < 4}>
                    {pasoCorreo.paso === 'verificando' || ocupado ? 'Entrando…' : 'Entrar'}
                  </button>
                </form>
              )}
              {pasoCorreo.paso === 'error' && <Aviso tipo="peligro">{pasoCorreo.mensaje}</Aviso>}
            </div>
          )}
          <button
            type="button"
            className={hayCorreo ? 'boton boton-chico' : 'boton boton-primario boton-grande'}
            disabled={ocupado}
            onClick={() => {
              setConWallet(true);
              void intentar(entrarConWallet).finally(() => setConWallet(false));
            }}
          >
            {ocupado && conWallet ? 'Esperando a tu wallet…' : hayCorreo ? '¿Ya usas Web3? Conecta tu wallet' : 'Conectar mi wallet'}
          </button>
          <p className="tenue pequeno">
            Con tu wallet solo firmas un mensaje para demostrar que es tuya: no mueve dinero ni autoriza pagos. Funciona con Freighter, xBull,
            LOBSTR{servicios().walletconnect_project_id ? ' (también desde el celular, con el QR de WalletConnect)' : ''} y otras.
          </p>
          <button type="button" className="boton" onClick={onListo}>
            Solo mirar el pueblo
          </button>
          {import.meta.env.DEV && config.red === 'testnet' && (
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
      <button type="button" className="enlace" onClick={() => abrir({ tipo: 'comentarios' })}>
        Enviar comentarios
      </button>
      <EnlacesLegales />
    </div>
  );
}
