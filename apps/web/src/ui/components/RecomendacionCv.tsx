import { cvArmado } from '@cryptoville/shared';
import { useEffect, useState } from 'react';
import { useSesion } from '../../features/auth/sesion';
import { cargarMiCv } from '../../features/plaza/datos';
import { supabase } from '../../lib/supabase';
import { useEstado } from '../estado';
import { Icono } from './Iconos';

const clave = (usuarioId: string) => `cryptoville-recomendacion-cv:${usuarioId}`;

function yaVista(usuarioId: string): boolean {
  try {
    return localStorage.getItem(clave(usuarioId)) === 'vista';
  } catch {
    // Sin almacenamiento: mejor no insistir.
    return true;
  }
}

function marcarVista(usuarioId: string): void {
  try {
    localStorage.setItem(clave(usuarioId), 'vista');
  } catch {
    // Sin almacenamiento local: no pasa nada.
  }
}

/**
 * Un aviso, una sola vez: a quien ya tiene un local (y por eso su edificio en la Plaza) pero todavía no
 * armó su CV. Se cierra con «Ahora no» o al ir a armarlo, y no vuelve a salir en este navegador.
 */
export function RecomendacionCv() {
  const { usuario, locales } = useSesion();
  const { abrir } = useEstado();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!usuario || !locales.length || yaVista(usuario.id)) {
      setVisible(false);
      return;
    }
    let activo = true;
    void Promise.all([
      cargarMiCv(usuario.id),
      supabase().from('experiencias').select('id', { count: 'exact', head: true }).eq('usuario_id', usuario.id),
    ]).then(([cv, experiencias]) => activo && setVisible(!cvArmado(cv, experiencias.count ?? 0)));
    return () => {
      activo = false;
    };
  }, [usuario, locales.length]);

  if (!visible || !usuario) return null;
  const listo = () => {
    marcarVista(usuario.id);
    setVisible(false);
  };

  return (
    <aside className="recomendacion-cv" role="status" aria-label="Recomendación">
      <span className="recomendacion-cv-icono" aria-hidden="true">
        <Icono nombre="edificio" tamano={22} />
      </span>
      <div className="pila-compacta">
        <strong>Arma tu CV en la Plaza</strong>
        <span className="pequeno">Ya tienes tu edificio en la Plaza principal. Cuéntales a los clientes quién eres: experiencia, estudios, habilidades y tu CV en PDF.</span>
        <div className="fila">
          <button
            type="button"
            className="boton boton-mini boton-primario"
            onClick={() => {
              listo();
              abrir({ tipo: 'mi-portafolio' });
            }}
          >
            Arma tu CV
          </button>
          <button type="button" className="boton boton-mini" onClick={listo}>
            Ahora no
          </button>
        </div>
      </div>
    </aside>
  );
}
