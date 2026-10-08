// `npm run mainnet:revisar`: revisa el .env como si fuera a arrancar en mainnet, sin arrancar la API
// ni tocar la base. Sirve para ir completando la checklist de docs/mainnet.md.
// Lo que se revisa al arrancar de verdad (pedidos de ejemplo en la base, contrato en la red) está en arranque.module.ts.
import '../env';
import { leerConfiguracion } from './configuracion';
import { hayLlavesDeEjemplo, revisarConfiguracion } from './revision-mainnet';

function principal(): void {
  let config;
  try {
    config = leerConfiguracion({ ...process.env, STELLAR_NETWORK: process.env.STELLAR_NETWORK ?? 'mainnet' });
  } catch (e) {
    console.error(`✖ El .env tiene un error: ${(e as Error).message}`);
    process.exit(1);
  }
  if (config.stellar.red !== 'mainnet') {
    console.log('ℹ STELLAR_NETWORK es "testnet": se revisa como si fuera mainnet.');
  }
  const { problemas, avisos } = revisarConfiguracion({ ...config, stellar: { ...config.stellar, red: 'mainnet' } }, { llavesDeEjemplo: hayLlavesDeEjemplo() });
  for (const a of avisos) console.log(`⚠ ${a}`);
  if (problemas.length === 0) {
    console.log('✔ La configuración está lista para mainnet (falta lo que revisa la API al arrancar: base y contrato).');
    return;
  }
  console.log(`✖ Faltan ${problemas.length} cosas para mainnet:`);
  for (const p of problemas) console.log(`  - ${p}`);
  process.exit(1);
}

principal();
