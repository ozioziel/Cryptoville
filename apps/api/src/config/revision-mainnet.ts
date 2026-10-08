import { datosRed, reglasDe } from '@cryptoville/shared';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Configuracion } from './configuracion';

/**
 * Revisión de la configuración antes de arrancar.
 * - En mainnet, cualquier "problema" impide que la API arranque (y se dice cuál es).
 * - En testnet los mismos puntos solo se avisan en el log.
 * La lista completa de pasos para lanzar está en docs/mainnet.md.
 */
export interface ResultadoRevision {
  problemas: string[];
  avisos: string[];
}

/** Rutas donde puede estar el archivo de llaves de ejemplo (raíz del repo o dentro de Docker). */
export const RUTAS_SEED_KEYS = [path.resolve(__dirname, '../../../../.seed-keys.json'), '/app/.seed-keys.json'];

/** ¿El valor (en cualquier nivel) contiene alguna llave secreta S…? */
function tieneLlaveSecreta(valor: unknown): boolean {
  if (typeof valor === 'string') return /^S[A-Z2-7]{55}$/.test(valor);
  if (Array.isArray(valor)) return valor.some(tieneLlaveSecreta);
  if (valor && typeof valor === 'object') return Object.values(valor).some(tieneLlaveSecreta);
  return false;
}

/** ¿Hay llaves de ejemplo cargadas? (el archivo "sin-llaves.json" de Docker no trae ninguna). */
export function hayLlavesDeEjemplo(rutas: string[] = RUTAS_SEED_KEYS): boolean {
  for (const ruta of rutas) {
    if (!existsSync(ruta)) continue;
    try {
      if (tieneLlaveSecreta(JSON.parse(readFileSync(ruta, 'utf8')))) return true;
    } catch {
      // Un archivo que no se puede leer no cuenta como llaves.
    }
  }
  return false;
}

export function revisarConfiguracion(c: Configuracion, extra: { llavesDeEjemplo: boolean }): ResultadoRevision {
  const problemas: string[] = [];
  const s = c.stellar;
  const reglas = reglasDe(s.red);
  const exigir = (condicion: boolean, texto: string) => {
    if (!condicion) problemas.push(texto);
  };

  exigir(c.entorno === 'production', 'NODE_ENV debe ser "production"');
  exigir(!extra.llavesDeEjemplo, 'Hay llaves de ejemplo (.seed-keys.json): en mainnet no se usan, quita el archivo');
  exigir(Boolean(s.contratoId || s.contratoV2Id), 'Falta el contrato de escrow (ESCROW_V2_CONTRACT_ID y/o ESCROW_CONTRACT_ID)');
  exigir(Boolean(s.tokenId), 'Falta PAYMENT_TOKEN_ID (el contrato SAC del USDC real)');
  exigir(Boolean(s.arbitro), 'Falta ARBITRO_DIRECCION');
  exigir(Boolean(s.tesoreria), 'Falta TESORERIA_DIRECCION');
  exigir(!/prueba|test/i.test(s.asset ?? ''), 'PAYMENT_ASSET dice "de prueba": en mainnet es el USDC real');
  exigir(s.verificar, 'STELLAR_VERIFICAR no puede ser "no": en mainnet cada pago se verifica en la red');
  exigir(s.rpcUrl !== datosRed('testnet').rpcUrl && !/testnet/i.test(s.rpcUrl), 'STELLAR_RPC_URL apunta a testnet');
  exigir(c.entornoServicios === 'produccion', 'ENTORNO_SERVICIOS debe ser "produccion" (Didit, Mux y Pollar con llaves reales, no sandbox)');
  exigir(Boolean(c.secretoKyc && c.servicios.didit), 'El KYC tiene que estar encendido en mainnet (variables DIDIT_* y KYC_HMAC_SECRET)');
  exigir(!/localhost|127\.0\.0\.1/.test(c.urlPublica), 'PUBLIC_URL / PUBLIC_HOST no puede ser localhost');
  exigir(c.urlPublica.startsWith('https://'), 'La app debe servirse por HTTPS (PUBLIC_HOST con dominio o sslip.io)');
  exigir(
    s.comisionBps === reglas.comisiones.garantiaBps,
    `COMISION_BPS (${s.comisionBps}) no coincide con el archivo de reglas (${reglas.comisiones.garantiaBps})`,
  );
  exigir(
    s.plazoRevisionSeg === reglas.plazos.revisionSeg,
    `PLAZO_REVISION_SEG (${s.plazoRevisionSeg}) no coincide con el archivo de reglas (${reglas.plazos.revisionSeg})`,
  );
  exigir(!c.rampaSimulada, 'RAMPA_SIMULADA está encendida: en mainnet la rampa es real (docs/simulaciones.md)');
  if (s.arbitro && s.tesoreria && s.arbitro === s.tesoreria) {
    problemas.push('El árbitro y la tesorería deben ser cuentas distintas');
  }

  const avisos: string[] = [];
  if (!c.servicios.correo) avisos.push('Los correos de aviso están apagados (RESEND_API_KEY, CORREO_REMITENTE)');
  if (!c.servicios.push) avisos.push('Las notificaciones del navegador están apagadas (VAPID_*)');
  if (!c.servicios.mux) avisos.push('Los videos (Mux) están apagados: las pruebas solo aceptan archivos y enlaces');
  if (!s.llaveMantenimiento) avisos.push('Sin llave de mantenimiento: los vencimientos no se ejecutan solos');
  return { problemas, avisos };
}

/** En testnet no se exige nada de esto (solo en mainnet). */
export function revisarParaArrancar(c: Configuracion, extra: { llavesDeEjemplo: boolean }): ResultadoRevision {
  if (c.stellar.red !== 'mainnet') return { problemas: [], avisos: [] };
  return revisarConfiguracion(c, extra);
}
