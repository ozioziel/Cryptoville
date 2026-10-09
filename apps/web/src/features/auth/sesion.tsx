import type { Local, MetodoEntrada, Usuario } from '@cryptoville/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../../lib/api';
import { obtenerConfig, servicios } from '../../lib/config';
import { supabase } from '../../lib/supabase';
import { firmanteDesdeSecreta, firmarTransaccionLocal } from './firma-local';
import {
  clientePollar,
  direccionPollar,
  entrarConGooglePollar,
  firmarMensajePollar,
  firmarTransaccionPollar,
  nombreDePollar,
  pasoDe,
  salirDePollar,
  type PasoCorreo,
} from './pollar';
import { CanceladoPorUsuario, conectarWallet, desconectarWallet, firmarConWallet, firmarTransaccionConWallet } from './wallet';

/** Con qué wallet firma la sesión: se guarda en el navegador para no preguntar de nuevo al recargar. */
interface Firmante {
  metodo: MetodoEntrada;
  direccion: string;
}

const CLAVE_FIRMANTE = 'cryptoville-firmante';
/** Solo en desarrollo: la llave de prueba se guarda en la pestaña (sessionStorage) para firmar transacciones. */
const CLAVE_SECRETA_DEV = 'cryptoville-llave-prueba';

interface Sesion {
  usuario: Usuario | null;
  /** Local principal (el más antiguo), como antes de v2. */
  local: Local | null;
  /** Todos mis locales, del más antiguo al más nuevo (hasta 3 gratis). */
  locales: Local[];
  cargando: boolean;
  /** Cómo entró la persona y qué wallet firma ahora (puede ser cualquiera de las de su cuenta). */
  firmante: Firmante | null;
  entrarConWallet(): Promise<void>;
  /** Entrar con Google (Pollar): la cuenta y su wallet se crean por detrás. */
  entrarConGoogle(): Promise<void>;
  /** Entrar con correo (Pollar), paso 1: manda un código al correo. */
  pedirCodigo(correo: string): Promise<void>;
  /** Paso 2: con el código, entra (y si es la primera vez, se crea su cuenta y su wallet). */
  confirmarCodigo(codigo: string): Promise<void>;
  pasoCorreo: { paso: PasoCorreo; mensaje?: string };
  /** Solo en desarrollo: entra con una llave secreta de testnet de .seed-keys.json. */
  entrarConSecreta(secreta: string): Promise<void>;
  salir(): Promise<void>;
  recargar(): Promise<void>;
  /** Wallet que va a firmar la próxima transacción (si hace falta, pide conectarla). */
  walletParaFirmar(): Promise<string>;
  /** Firma con la wallet de la sesión una transacción armada por WorkVille. */
  firmarTransaccion(xdr: string, direccion: string): Promise<string>;
  /** Suma otra wallet a la cuenta: se elige en el selector y firma un mensaje. */
  vincularWallet(): Promise<void>;
}

const Contexto = createContext<Sesion | null>(null);

interface RespuestaSesion {
  access_token: string;
  refresh_token: string;
  usuario: Usuario;
}

function leerFirmante(): Firmante | null {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE_FIRMANTE) ?? 'null') as Firmante | null;
    return v && typeof v.direccion === 'string' && typeof v.metodo === 'string' ? v : null;
  } catch {
    return null;
  }
}

function guardarFirmante(f: Firmante | null): void {
  try {
    if (f) localStorage.setItem(CLAVE_FIRMANTE, JSON.stringify(f));
    else localStorage.removeItem(CLAVE_FIRMANTE);
  } catch {
    // Sin almacenamiento local: se volverá a preguntar al firmar.
  }
}

async function iniciarSesion(direccion: string, firmar: (mensaje: string) => Promise<string>, metodo: MetodoEntrada): Promise<void> {
  const desafio = await api<{ nonce: string; mensaje: string }>('/auth/desafio', { cuerpo: { direccion } });
  const firma = await firmar(desafio.mensaje);
  const r = await api<RespuestaSesion>('/auth/verificar', { cuerpo: { direccion, nonce: desafio.nonce, firma, metodo } });
  const { error } = await supabase().auth.setSession({ access_token: r.access_token, refresh_token: r.refresh_token });
  if (error) throw new Error('No se pudo guardar la sesión');
}

function pollar() {
  const llave = servicios().pollar_api_key;
  if (!llave) throw new Error('La entrada con correo no está disponible en este servidor');
  return clientePollar(llave, obtenerConfig().red);
}

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [locales, setLocales] = useState<Local[]>([]);
  const local = locales[0] ?? null;
  const [cargando, setCargando] = useState(true);
  const [firmante, setFirmante] = useState<Firmante | null>(leerFirmante);
  const [pasoCorreo, setPasoCorreo] = useState<{ paso: PasoCorreo; mensaje?: string }>({ paso: 'correo' });

  const usar = useCallback((f: Firmante | null) => {
    setFirmante(f);
    guardarFirmante(f);
  }, []);

  const recargar = useCallback(async () => {
    const { data } = await supabase().auth.getSession();
    if (!data.session) {
      setUsuario(null);
      setLocales([]);
      return;
    }
    try {
      const yo = await api<{ usuario: Usuario; local: Local | null; locales?: Local[] }>('/yo');
      setUsuario(yo.usuario);
      setLocales(yo.locales ?? (yo.local ? [yo.local] : []));
    } catch {
      await supabase().auth.signOut();
      setUsuario(null);
      setLocales([]);
    }
  }, []);

  useEffect(() => {
    recargar().finally(() => setCargando(false));
    const { data } = supabase().auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_OUT') {
        setUsuario(null);
        setLocales([]);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [recargar]);

  const entrarConWallet = useCallback(async () => {
    const { red } = obtenerConfig();
    const wc = servicios().walletconnect_project_id;
    const direccion = await conectarWallet(red, wc);
    await iniciarSesion(direccion, (m) => firmarConWallet(m, direccion, red, wc), 'wallet');
    usar({ metodo: 'wallet', direccion });
    await recargar();
  }, [recargar, usar]);

  // Entrar con correo (Pollar): el SDK avisa en qué paso va (mandando el código, esperando el código…).
  const terminarConPollar = useCallback(async () => {
    const c = await pollar();
    const direccion = direccionPollar(c);
    if (!direccion) throw new Error('Tu cuenta todavía no tiene una wallet. Vuelve a intentar en un momento.');
    await iniciarSesion(direccion, (m) => firmarMensajePollar(c, m), 'pollar');
    usar({ metodo: 'pollar', direccion });
    await recargar();
  }, [recargar, usar]);

  const entrarConGoogle = useCallback(async () => {
    const c = await pollar();
    await entrarConGooglePollar(c, CanceladoPorUsuario);
    await terminarConPollar();
    // Cuenta nueva: se queda con el nombre de Google en lugar de «Vecino 1234» (se puede cambiar en el perfil).
    const nombre = nombreDePollar(c);
    if (nombre) {
      try {
        const yo = await api<{ usuario: Usuario }>('/yo');
        if (/^Vecino [A-Z0-9]{4}$/.test(yo.usuario.nombre)) {
          await api('/yo', { metodo: 'PATCH', cuerpo: { nombre } });
          await recargar();
        }
      } catch {
        // El nombre se puede poner después en el perfil.
      }
    }
  }, [terminarConPollar, recargar]);

  const pedirCodigo = useCallback(async (correo: string) => {
    const c = await pollar();
    if (c.getAuthState().step === 'authenticated') {
      setPasoCorreo({ paso: 'listo' });
      return;
    }
    c.onAuthStateChange((estado) => setPasoCorreo(pasoDe(estado)));
    c.beginEmailLogin();
    c.sendEmailCode(correo.trim());
  }, []);

  const confirmarCodigo = useCallback(
    async (codigo: string) => {
      const c = await pollar();
      if (c.getAuthState().step !== 'authenticated') {
        await new Promise<void>((listo, fallo) => {
          const quitar = c.onAuthStateChange((estado) => {
            const p = pasoDe(estado);
            setPasoCorreo(p);
            if (p.paso === 'listo') {
              quitar();
              listo();
            } else if (p.paso === 'error') {
              quitar();
              fallo(new Error(p.mensaje));
            }
          });
          c.verifyEmailCode(codigo.trim());
        });
      }
      await terminarConPollar();
    },
    [terminarConPollar],
  );

  const entrarConSecreta = useCallback(
    async (secreta: string) => {
      if (!import.meta.env.DEV) throw new Error('Solo disponible en desarrollo');
      const firmanteLocal = await firmanteDesdeSecreta(secreta);
      await iniciarSesion(firmanteLocal.direccion, firmanteLocal.firmar, 'llave-prueba');
      try {
        sessionStorage.setItem(CLAVE_SECRETA_DEV, secreta.trim());
      } catch {
        // Se pedirá la llave al firmar.
      }
      usar({ metodo: 'llave-prueba', direccion: firmanteLocal.direccion });
      await recargar();
    },
    [recargar, usar],
  );

  const salir = useCallback(async () => {
    await supabase().auth.signOut();
    if (firmante?.metodo === 'pollar') await salirDePollar();
    await desconectarWallet();
    try {
      sessionStorage.removeItem(CLAVE_SECRETA_DEV);
    } catch {
      // No pasa nada.
    }
    usar(null);
    setUsuario(null);
    setLocales([]);
  }, [firmante, usar]);

  const walletParaFirmar = useCallback(async () => {
    const { red } = obtenerConfig();
    if (firmante?.metodo === 'pollar') {
      const direccion = direccionPollar(await pollar());
      if (direccion) return direccion;
    }
    if (firmante?.metodo === 'llave-prueba' && import.meta.env.DEV) return firmante.direccion;
    if (firmante?.metodo === 'wallet') return firmante.direccion;
    // No sabemos con qué wallet firmar: se elige en el selector.
    const direccion = await conectarWallet(red, servicios().walletconnect_project_id);
    usar({ metodo: 'wallet', direccion });
    return direccion;
  }, [firmante, usar]);

  const firmarTransaccion = useCallback(
    async (xdr: string, direccion: string) => {
      const { red, passphrase } = obtenerConfig();
      if (firmante?.metodo === 'pollar') return firmarTransaccionPollar(await pollar(), xdr);
      if (firmante?.metodo === 'llave-prueba' && import.meta.env.DEV) {
        let secreta: string | null = null;
        try {
          secreta = sessionStorage.getItem(CLAVE_SECRETA_DEV);
        } catch {
          secreta = null;
        }
        secreta ??= window.prompt('Pega otra vez tu llave de prueba (S…) para firmar') ?? '';
        if (!secreta) throw new Error('Hace falta tu llave de prueba para firmar');
        return firmarTransaccionLocal(secreta, xdr, passphrase ?? '');
      }
      return firmarTransaccionConWallet(xdr, direccion, red, servicios().walletconnect_project_id);
    },
    [firmante],
  );

  const vincularWallet = useCallback(async () => {
    const { red } = obtenerConfig();
    const wc = servicios().walletconnect_project_id;
    const direccion = await conectarWallet(red, wc);
    const d = await api<{ nonce: string; mensaje: string }>('/wallets/desafio', { cuerpo: { direccion } });
    const firma = await firmarConWallet(d.mensaje, direccion, red, wc);
    await api('/wallets/vincular', { cuerpo: { direccion, nonce: d.nonce, firma, metodo: 'wallet' } });
    // La wallet recién sumada queda conectada: es la que firma desde ahora.
    usar({ metodo: 'wallet', direccion });
  }, [usar]);

  const valor = useMemo(
    () => ({
      usuario,
      local,
      locales,
      cargando,
      firmante,
      entrarConWallet,
      entrarConGoogle,
      pedirCodigo,
      confirmarCodigo,
      pasoCorreo,
      entrarConSecreta,
      salir,
      recargar,
      walletParaFirmar,
      firmarTransaccion,
      vincularWallet,
    }),
    [usuario, local, locales, cargando, firmante, entrarConWallet, entrarConGoogle, pedirCodigo, confirmarCodigo, pasoCorreo, entrarConSecreta, salir, recargar, walletParaFirmar, firmarTransaccion, vincularWallet],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion(): Sesion {
  const s = useContext(Contexto);
  if (!s) throw new Error('useSesion fuera de ProveedorSesion');
  return s;
}
