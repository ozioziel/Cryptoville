import { CONFIG_INICIAL, esContratoValido, pareceDireccionStellar, type RedStellar } from '@cryptoville/shared';

/** Configuración de la API, leída y validada desde las variables de entorno (.env de la raíz). */
export interface Configuracion {
  entorno: 'development' | 'production' | 'test';
  puerto: number;
  /** Dominio o IP pública (aparece en el mensaje de inicio de sesión). */
  publicHost: string;
  origenesCors: string[];
  logNivel: string;
  supabase: {
    url: string;
    /** URL que usa el navegador (en Docker local puede ser distinta de la que usa la API). */
    urlPublica: string;
    anonKey: string;
    serviceRoleKey: string;
  };
  databaseUrl: string;
  auth: {
    secretoContrasenas: string;
    dominioCorreo: string;
  };
  stellar: {
    red: RedStellar;
    contratoId: string | null;
    tokenId: string | null;
    asset: string | null;
    arbitro: string | null;
    comisionBps: number;
    plazoRevisionSeg: number;
  };
}

function requerida(env: NodeJS.ProcessEnv, nombre: string): string {
  const valor = env[nombre]?.trim();
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre} (revisa el .env, ver .env.example)`);
  return valor;
}

function opcional(env: NodeJS.ProcessEnv, nombre: string): string | null {
  const valor = env[nombre]?.trim();
  return valor ? valor : null;
}

function entero(env: NodeJS.ProcessEnv, nombre: string, defecto: number): number {
  const valor = opcional(env, nombre);
  if (valor === null) return defecto;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${nombre} debe ser un entero positivo`);
  return n;
}

export function leerConfiguracion(env: NodeJS.ProcessEnv = process.env): Configuracion {
  const entorno = (env.NODE_ENV ?? 'development') as Configuracion['entorno'];
  const publicHost = opcional(env, 'PUBLIC_HOST') ?? 'localhost';
  const supabaseUrl = requerida(env, 'SUPABASE_URL').replace(/\/$/, '');

  const secreto = requerida(env, 'AUTH_PASSWORD_SECRET');
  if (secreto.length < 32) throw new Error('AUTH_PASSWORD_SECRET debe tener al menos 32 caracteres');

  const red = (opcional(env, 'STELLAR_NETWORK') ?? 'testnet') as RedStellar;
  if (red !== 'testnet' && red !== 'mainnet') throw new Error('STELLAR_NETWORK debe ser testnet o mainnet');

  const contratoId = opcional(env, 'ESCROW_CONTRACT_ID');
  if (contratoId && !esContratoValido(contratoId)) throw new Error('ESCROW_CONTRACT_ID no parece un contrato (C… de 56 caracteres)');
  const tokenId = opcional(env, 'PAYMENT_TOKEN_ID');
  if (tokenId && !esContratoValido(tokenId)) throw new Error('PAYMENT_TOKEN_ID no parece un contrato (C… de 56 caracteres)');
  const arbitro = opcional(env, 'ARBITRO_DIRECCION');
  if (arbitro && !pareceDireccionStellar(arbitro)) throw new Error('ARBITRO_DIRECCION no parece una dirección G…');

  const origenes = opcional(env, 'CORS_ORIGINS');
  return {
    entorno,
    puerto: entero(env, 'PORT', 3000),
    publicHost,
    origenesCors: origenes ? origenes.split(',').map((o) => o.trim()).filter(Boolean) : [],
    logNivel: opcional(env, 'LOG_LEVEL') ?? (entorno === 'production' ? 'info' : 'debug'),
    supabase: {
      url: supabaseUrl,
      urlPublica: (opcional(env, 'SUPABASE_PUBLIC_URL') ?? supabaseUrl).replace(/\/$/, ''),
      anonKey: requerida(env, 'SUPABASE_ANON_KEY'),
      serviceRoleKey: requerida(env, 'SUPABASE_SERVICE_ROLE_KEY'),
    },
    databaseUrl: requerida(env, 'DATABASE_URL'),
    auth: {
      secretoContrasenas: secreto,
      dominioCorreo: opcional(env, 'AUTH_EMAIL_DOMAIN') ?? 'wallet.cryptoville.test',
    },
    stellar: {
      red,
      contratoId,
      tokenId,
      asset: opcional(env, 'PAYMENT_ASSET'),
      arbitro,
      comisionBps: entero(env, 'COMISION_BPS', CONFIG_INICIAL.comision_bps),
      plazoRevisionSeg: entero(env, 'PLAZO_REVISION_SEG', CONFIG_INICIAL.plazo_revision_seg),
    },
  };
}

export const CONFIGURACION = Symbol('CONFIGURACION');
