import { enlacePagina, esHashValido, type Parte } from '@cryptoville/shared';
import { useState } from 'react';
import { api, mensajeDeError } from '../../lib/api';
import { obtenerConfig } from '../../lib/config';
import { avisarCambioDeSaldo } from '../rampas/datos';
import { useEstado } from '../../ui/estado';
import { Aviso, Copiar } from '../../ui/components/basicos';
import { Icono } from '../../ui/components/Iconos';
import { useSesion } from '../auth/sesion';
import { CanceladoPorUsuario } from '../auth/wallet';

type Etapa = 'listo' | 'armando' | 'firmando' | 'enviando';

const TEXTO: Record<Etapa, string> = {
  listo: 'Firmar con mi wallet',
  armando: 'Armando la transacción…',
  firmando: 'Firma en tu wallet…',
  enviando: 'Enviando a la red…',
};

export interface DatosExtraPaso {
  a_favor_de?: Parte;
  motivo?: string;
  decision?: string;
  /** Contrato v2: fase del pedido y resultado de una disputa. */
  fase?: number;
  resultado?: 'Cliente' | 'Proveedor' | 'Mitad';
  /** Retiro al banco: cuál. */
  rampa_id?: string;
}

/**
 * Firmar un paso del contrato dentro de la app, sin Stellar Lab:
 * WorkVille arma la transacción, tu wallet la firma (en tu dispositivo) y WorkVille la envía y la verifica.
 * - tipo "paso_pedido": contrato v1 · "paso_v2": fases del contrato v2 · "pago_directo": pago sin garantía
 *   · "pago_local": pago único del local extra (no es de un pedido) · "retiro_rampa": mandar USDC a la rampa para cobrarlo en el banco.
 */
export function FirmarEnApp({
  pedidoId,
  accion,
  etiqueta,
  extra,
  tipo = 'paso_pedido',
  texto,
  deshabilitado,
  onListo,
}: {
  /** Pedido del paso (no hace falta en el pago del local extra). */
  pedidoId?: string;
  accion?: string;
  etiqueta: string;
  extra?: DatosExtraPaso;
  tipo?: 'paso_pedido' | 'paso_v2' | 'pago_directo' | 'pago_local' | 'retiro_rampa';
  /** Texto del botón (por defecto, «Firmar con mi wallet»). */
  texto?: string;
  deshabilitado?: boolean;
  onListo: () => void;
}) {
  const { walletParaFirmar, firmarTransaccion } = useSesion();
  const { avisar } = useEstado();
  const [etapa, setEtapa] = useState<Etapa>('listo');
  const [error, setError] = useState<string | null>(null);

  const firmar = async () => {
    setError(null);
    const cargando = avisar(`${etiqueta}: armando la transacción…`, 'cargando');
    try {
      setEtapa('armando');
      const direccion = await walletParaFirmar();
      const preparada = await api<{ id: string; xdr: string }>('/transacciones/preparar', {
        cuerpo: { tipo, pedido_id: pedidoId, accion, direccion, ...extra },
      });
      setEtapa('firmando');
      const firmada = await firmarTransaccion(preparada.xdr, direccion);
      setEtapa('enviando');
      await api('/transacciones/enviar', { cuerpo: { id: preparada.id, xdr_firmado: firmada } });
      avisar(`Listo: ${etiqueta.toLowerCase()} (verificado en la red)`, 'exito', cargando);
      avisarCambioDeSaldo();
      onListo();
    } catch (e) {
      if (e instanceof CanceladoPorUsuario) {
        avisar('Cancelaste la firma: no se hizo nada', 'info', cargando);
      } else {
        avisar('No se pudo completar el paso', 'error', cargando);
        setError(mensajeDeError(e));
      }
    } finally {
      setEtapa('listo');
    }
  };

  return (
    <div className="pila-compacta">
      <button type="button" className="boton boton-primario" disabled={deshabilitado || etapa !== 'listo'} onClick={firmar}>
        <Icono nombre="escudo" /> {etapa === 'listo' ? (texto ?? TEXTO.listo) : TEXTO[etapa]}
      </button>
      <span className="tenue pequeno">Tu wallet te muestra qué firmas. WorkVille nunca tiene tus llaves.</span>
      {error && <Aviso tipo="peligro">{error}</Aviso>}
      {pedidoId && accion && (tipo === 'paso_v2' || tipo === 'pago_directo') && (
        <FirmarFueraV2 pedidoId={pedidoId} accion={accion} tipo={tipo} etiqueta={etiqueta} extra={extra} deshabilitado={deshabilitado} onListo={onListo} />
      )}
    </div>
  );
}

/**
 * Respaldo del contrato v2 para cuando la wallet no puede firmar dentro de la app:
 * WorkVille arma la transacción, la persona la firma en Stellar Lab (o en otra wallet) y pega aquí
 * el hash (si ya la envió) o la transacción firmada (para que WorkVille la envíe). En los dos casos la API la verifica.
 */
function FirmarFueraV2({
  pedidoId,
  accion,
  tipo,
  etiqueta,
  extra,
  deshabilitado,
  onListo,
}: {
  pedidoId: string;
  accion: string;
  tipo: 'paso_v2' | 'pago_directo';
  etiqueta: string;
  extra?: DatosExtraPaso;
  deshabilitado?: boolean;
  onListo: () => void;
}) {
  const { usuario } = useSesion();
  const { avisar } = useEstado();
  const config = obtenerConfig();
  // El árbitro firma con la wallet del árbitro del contrato; el resto, con la wallet de su cuenta.
  const [direccion, setDireccion] = useState(() => (accion === 'resolver' && config.arbitro ? config.arbitro : (usuario?.direccion ?? '')));
  const [preparada, setPreparada] = useState<{ id: string; xdr: string } | null>(null);
  const [respuesta, setRespuesta] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const texto = respuesta.trim();
  const esHash = esHashValido(texto);

  const preparar = async () => {
    setError(null);
    setOcupado(true);
    try {
      setPreparada(await api<{ id: string; xdr: string }>('/transacciones/preparar', { cuerpo: { tipo, pedido_id: pedidoId, accion, direccion: direccion.trim(), ...extra } }));
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setOcupado(false);
    }
  };

  const registrar = async () => {
    setError(null);
    setOcupado(true);
    try {
      if (esHash) {
        // Ya se envió desde el Lab: la API busca la transacción en la red y revisa que sea este paso.
        await api(`/pedidos/${pedidoId}/fases/pasos`, {
          cuerpo: { accion, hash: texto.toLowerCase(), fase: extra?.fase, resultado: extra?.resultado, motivo: extra?.motivo, decision: extra?.decision },
        });
      } else {
        if (!preparada) throw new Error('Primero arma la transacción (paso 1)');
        await api('/transacciones/enviar', { cuerpo: { id: preparada.id, xdr_firmado: texto } });
      }
      avisar(`Listo: ${etiqueta.toLowerCase()} (verificado en la red)`, 'exito');
      avisarCambioDeSaldo();
      onListo();
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <details className="pequeno">
      <summary>¿Tu wallet no firma aquí? Hazlo en Stellar Lab</summary>
      <div className="paso-lab">
        <ol className="lista-pasos">
          <li>
            Wallet con la que vas a firmar:
            <input className="campo" value={direccion} onChange={(e) => setDireccion(e.target.value.trim())} spellCheck={false} placeholder="G…" />
            <button type="button" className="boton boton-chico" disabled={deshabilitado || ocupado || !/^G[A-Z2-7]{55}$/.test(direccion)} onClick={preparar}>
              {ocupado && !preparada ? 'Armando…' : 'Armar la transacción'}
            </button>
          </li>
          {preparada && (
            <>
              <li>
                Copia la transacción (sin firmar):
                <textarea className="campo" rows={3} readOnly value={preparada.xdr} spellCheck={false} />
                <Copiar texto={preparada.xdr} />
              </li>
              <li>
                <a className="boton boton-chico" href={enlacePagina('firmar-tx', config.red)} target="_blank" rel="noreferrer">
                  Abrir «Sign transaction» en Stellar Lab <Icono nombre="enlace" tamano={14} />
                </a>{' '}
                Pégala, firma con tu wallet y después: o la envías desde el Lab («Submit») y copias el <strong>hash</strong>, o copias la{' '}
                <strong>transacción firmada</strong>. Vence en unos minutos: si tardas, vuelve a armarla.
              </li>
            </>
          )}
          <li>
            Pega aquí el hash (64 caracteres) o la transacción firmada:
            <textarea className="campo" rows={2} value={respuesta} onChange={(e) => setRespuesta(e.target.value)} spellCheck={false} />
            <button type="button" className="boton boton-primario boton-chico" disabled={ocupado || !texto || (!esHash && !preparada)} onClick={registrar}>
              {ocupado && preparada ? 'Verificando…' : esHash ? 'Registrar el paso con este hash' : 'Enviar la transacción firmada'}
            </button>
          </li>
        </ol>
        <span className="tenue">WorkVille revisa en la red que la transacción sea exactamente este paso (contrato, función, partes y montos).</span>
        {error && <Aviso tipo="peligro">{error}</Aviso>}
      </div>
    </details>
  );
}
