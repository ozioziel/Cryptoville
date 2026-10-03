import type { Aviso as AvisoT } from '@cryptoville/shared';
import { useEffect, useState } from 'react';
import { useSesion } from '../../features/auth/sesion';
import { api } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { useEstado } from '../estado';
import { Cargando, fechaCorta } from '../components/basicos';

export function PanelAvisos() {
  const { usuario } = useSesion();
  const { abrir, version, setAvisosSinLeer } = useEstado();
  const [avisos, setAvisos] = useState<AvisoT[] | null>(null);

  useEffect(() => {
    if (!usuario) return;
    void supabase()
      .from('avisos')
      .select('*')
      .eq('usuario_id', usuario.id)
      .order('creado_en', { ascending: false })
      .limit(50)
      .then(({ data }) => setAvisos((data ?? []) as AvisoT[]));
  }, [usuario, version]);

  // Al abrir el panel se marcan como leídos.
  useEffect(() => {
    if (!usuario) return;
    void api('/avisos/leidos', { cuerpo: {} }).then(() => setAvisosSinLeer(0));
  }, [usuario, setAvisosSinLeer]);

  if (!avisos) return <Cargando />;
  if (!avisos.length) return <p className="tenue">No tienes avisos todavía.</p>;
  return (
    <ul className="lista-tarjetas">
      {avisos.map((a) => (
        <li key={a.id}>
          <button
            type="button"
            className={`tarjeta ${a.leido ? '' : 'tarjeta-nueva'}`}
            disabled={!a.pedido_id}
            onClick={() => a.pedido_id && abrir({ tipo: 'pedido', id: a.pedido_id })}
          >
            <span>{a.texto}</span>
            <span className="tenue pequeno">{fechaCorta(a.creado_en)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
