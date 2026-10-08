import { comisionDeMetodo, comisionUnidades, porcentajeBps, unidadesAUsdc, usdcAUnidades, type MetodoPago } from '@cryptoville/shared';
import { useState } from 'react';
import { MetodosDePago } from '../pagos/MetodosDePago';
import { useSesion } from '../../features/auth/sesion';
import { api, mensajeDeError } from '../../lib/api';
import { obtenerConfig, reglas } from '../../lib/config';
import { useEstado } from '../estado';
import { Aviso, Avatar, Garantia } from '../components/basicos';

/** Detalle de un servicio y formulario para pedirlo. */
export function PanelServicio({ servicioId }: { servicioId: string }) {
  const { locales, abrir } = useEstado();
  const { usuario } = useSesion();
  const local = locales.find((l) => l.servicios.some((s) => s.id === servicioId));
  const servicio = local?.servicios.find((s) => s.id === servicioId);
  const [detalle, setDetalle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [metodo, setMetodo] = useState<MetodoPago>('garantia');
  const config = obtenerConfig();

  if (!local || !servicio) return <p className="tenue">Este servicio ya no está disponible.</p>;

  const conV2 = Boolean(config.contrato_v2_id);
  const bps = conV2 ? comisionDeMetodo(metodo, reglas()) : config.comision_bps;
  const comision = unidadesAUsdc(comisionUnidades(usdcAUnidades(servicio.precio_usdc), bps));
  const esMio = usuario?.id === local.usuario_id;

  const pedir = async () => {
    setError(null);
    setEnviando(true);
    try {
      const pedido = await api<{ id: string }>('/pedidos', { cuerpo: { servicio_id: servicio.id, detalle, metodo_pago: metodo } });
      abrir({ tipo: 'pedido', id: pedido.id });
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="pila">
      {servicio.foto_url && <img src={servicio.foto_url} alt={servicio.titulo} className="foto-grande" />}
      <h3>{servicio.titulo}</h3>
      <div className="fila">
        <Avatar frame={local.usuario.avatar} apariencia={local.usuario.apariencia} tamano={28} />
        <span>
          {local.usuario.nombre} · {local.nombre}
        </span>
      </div>
      <p className="precio precio-grande">{servicio.precio_usdc} USDC</p>
      <p>{servicio.descripcion}</p>
      <p className="tenue pequeno">
        Entrega en {servicio.dias_entrega} días. El proveedor recibe {servicio.precio_usdc} USDC menos la comisión de Cryptoville (
        {porcentajeBps(bps)} ≈ {comision} USDC)
        {metodo === 'directo' ? ' en el momento del pago.' : metodo === 'etapas' ? ' en partes, al aprobar cada fase.' : ' cuando liberes el pago.'}
      </p>
      {!conV2 && <Garantia />}
      {!esMio && (
        <>
          <span className="etiqueta">¿Cómo quieres pagar?</span>
          <MetodosDePago valor={metodo} onCambiar={setMetodo} reputacion={local.reputacion} />
        </>
      )}
      {esMio ? (
        <Aviso>Este servicio es tuyo.</Aviso>
      ) : usuario ? (
        <>
          <label className="etiqueta" htmlFor="detalle">
            ¿Qué necesitas?
          </label>
          <textarea
            id="detalle"
            className="campo"
            rows={4}
            maxLength={1000}
            placeholder="Cuenta los detalles: qué esperas recibir, fechas, formatos…"
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
          />
          <button type="button" className="boton boton-primario" disabled={enviando || detalle.trim().length < 10} onClick={pedir}>
            {enviando ? 'Enviando…' : 'Pedir este servicio'}
          </button>
          <p className="tenue pequeno">Todavía no pagas nada: primero el proveedor acepta el pedido y la fecha de entrega.</p>
        </>
      ) : (
        <button type="button" className="boton boton-primario" onClick={() => abrir({ tipo: 'bienvenida' })}>
          Entra para pedirlo
        </button>
      )}
      {error && <Aviso tipo="peligro">{error}</Aviso>}
    </div>
  );
}
