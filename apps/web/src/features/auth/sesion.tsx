import type { Local, Usuario } from '@cryptoville/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../../lib/api';
import { obtenerConfig } from '../../lib/config';
import { supabase } from '../../lib/supabase';
import { firmanteDesdeSecreta } from './firma-local';
import { conectarWallet, desconectarWallet, firmarConWallet } from './wallet';

interface Sesion {
  usuario: Usuario | null;
  local: Local | null;
  cargando: boolean;
  entrarConWallet(): Promise<void>;
  /** Solo en desarrollo: entra con una llave secreta de testnet de .seed-keys.json. */
  entrarConSecreta(secreta: string): Promise<void>;
  salir(): Promise<void>;
  recargar(): Promise<void>;
}

const Contexto = createContext<Sesion | null>(null);

interface RespuestaSesion {
  access_token: string;
  refresh_token: string;
  usuario: Usuario;
}

async function iniciarSesion(direccion: string, firmar: (mensaje: string) => Promise<string>): Promise<void> {
  const desafio = await api<{ nonce: string; mensaje: string }>('/auth/desafio', { cuerpo: { direccion } });
  const firma = await firmar(desafio.mensaje);
  const r = await api<RespuestaSesion>('/auth/verificar', { cuerpo: { direccion, nonce: desafio.nonce, firma } });
  const { error } = await supabase().auth.setSession({ access_token: r.access_token, refresh_token: r.refresh_token });
  if (error) throw new Error('No se pudo guardar la sesión');
}

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [local, setLocal] = useState<Local | null>(null);
  const [cargando, setCargando] = useState(true);

  const recargar = useCallback(async () => {
    const { data } = await supabase().auth.getSession();
    if (!data.session) {
      setUsuario(null);
      setLocal(null);
      return;
    }
    try {
      const yo = await api<{ usuario: Usuario; local: Local | null }>('/yo');
      setUsuario(yo.usuario);
      setLocal(yo.local);
    } catch {
      await supabase().auth.signOut();
      setUsuario(null);
      setLocal(null);
    }
  }, []);

  useEffect(() => {
    recargar().finally(() => setCargando(false));
    const { data } = supabase().auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_OUT') {
        setUsuario(null);
        setLocal(null);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [recargar]);

  const entrarConWallet = useCallback(async () => {
    const red = obtenerConfig().red;
    const direccion = await conectarWallet(red);
    await iniciarSesion(direccion, (m) => firmarConWallet(m, direccion, red));
    await recargar();
  }, [recargar]);

  const entrarConSecreta = useCallback(
    async (secreta: string) => {
      if (!import.meta.env.DEV) throw new Error('Solo disponible en desarrollo');
      const firmante = await firmanteDesdeSecreta(secreta);
      await iniciarSesion(firmante.direccion, firmante.firmar);
      await recargar();
    },
    [recargar],
  );

  const salir = useCallback(async () => {
    await supabase().auth.signOut();
    await desconectarWallet();
    setUsuario(null);
    setLocal(null);
  }, []);

  const valor = useMemo(
    () => ({ usuario, local, cargando, entrarConWallet, entrarConSecreta, salir, recargar }),
    [usuario, local, cargando, entrarConWallet, entrarConSecreta, salir, recargar],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion(): Sesion {
  const s = useContext(Contexto);
  if (!s) throw new Error('useSesion fuera de ProveedorSesion');
  return s;
}
