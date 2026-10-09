// Pruebas unitarias sin red: lectura de transacciones, argumentos de los contratos y revisión de mainnet.
import { PASSPHRASE } from '@cryptoville/shared';
import { Account, BASE_FEE, Contract, Keypair, TransactionBuilder, scValToNative } from '@stellar/stellar-sdk';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { leerConfiguracion } from '../src/config/configuracion';
import { hayLlavesDeEjemplo, revisarConfiguracion, revisarParaArrancar } from '../src/config/revision-mainnet';
import { arg, codigoErrorContrato, contratoOrigenDelError, hashDe, invocacionDe, mismoValor, transaccionDeXdr, variante } from '../src/stellar/cadena';

const CONTRATO = 'CCRQGMOX6H2XSGGCY536IONZNRR47RCPMKH7Z4U3SP3JC5L6HHF7AVS7';

function transaccion(funcion: string, args: ReturnType<typeof arg.u64>[], fuente = Keypair.random()) {
  return new TransactionBuilder(new Account(fuente.publicKey(), '10'), { fee: BASE_FEE, networkPassphrase: PASSPHRASE.testnet })
    .addOperation(new Contract(CONTRATO).call(funcion, ...args))
    .setTimeout(300)
    .build();
}

const ENV_BASE = {
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'servicio',
  DATABASE_URL: 'postgresql://localhost/db',
  AUTH_PASSWORD_SECRET: 'x'.repeat(40),
} as NodeJS.ProcessEnv;

describe('lectura de llamadas al contrato', () => {
  it('lee contrato, función y argumentos de una transacción', () => {
    const cliente = Keypair.random().publicKey();
    const proveedor = Keypair.random().publicKey();
    const tx = transaccion('crear_pedido', [arg.direccion(cliente), arg.direccion(proveedor), arg.u64('1789000123456'), arg.i128('105000000'), arg.u64(1_800_000_000)]);
    const inv = invocacionDe(transaccionDeXdr(tx.toXDR(), PASSPHRASE.testnet))!;
    expect(inv.contrato).toBe(CONTRATO);
    expect(inv.funcion).toBe('crear_pedido');
    expect(inv.args[0]).toBe(cliente);
    expect(inv.args[1]).toBe(proveedor);
    expect(mismoValor(inv.args[2], '1789000123456')).toBe(true);
    expect(mismoValor(inv.args[3], 105000000n)).toBe(true);
  });

  it('el hash no cambia al firmar (así se compara la transacción armada con la firmada)', () => {
    const par = Keypair.random();
    const tx = transaccion('liberar', [arg.direccion(par.publicKey()), arg.u64(7)], par);
    const antes = hashDe(tx);
    tx.sign(par);
    const firmada = transaccionDeXdr(tx.toXDR(), PASSPHRASE.testnet);
    expect(firmada.signatures.length).toBe(1);
    expect(hashDe(firmada)).toBe(antes);
  });

  it('enums y estructuras como los espera Soroban', () => {
    expect(variante(scValToNative(arg.variante('Cliente')))).toBe('Cliente');
    const fase = scValToNative(arg.estructura({ monto: arg.i128('10'), fecha_limite: arg.u64(5) })) as Record<string, unknown>;
    expect(Object.keys(fase)).toEqual(['fecha_limite', 'monto']);
    expect(() => arg.bytes32('abc')).toThrow();
    expect(scValToNative(arg.bytes32('a'.repeat(64)))).toBeInstanceOf(Uint8Array);
  });

  it('extrae el código de error del contrato del mensaje de simulación', () => {
    expect(codigoErrorContrato('HostError: Error(Contract, #7)\n...')).toBe(7);
    expect(codigoErrorContrato('otra cosa')).toBeNull();
  });

  it('encuentra el contrato donde nació el error aunque lo haya llamado otro', () => {
    const TOKEN = 'CAPNVQKXNFIJ4X75GMV2IHBXEZQ3RZRVAGMFWV6TGZSDYVT6AMSFJJFX';
    const mensaje = [
      'HostError: Error(Contract, #2)',
      'Event log (newest first):',
      `   0: [Diagnostic Event] contract:${CONTRATO}, topics:[error, Error(Contract, #2)], data:"escalating error to VM trap from failed host function call: call"`,
      `   1: [Diagnostic Event] contract:${CONTRATO}, topics:[error, Error(Contract, #2)], data:["contract call failed", transfer, []]`,
      `   2: [Diagnostic Event] contract:${TOKEN}, topics:[error, Error(Contract, #2)], data:["failing with contract error", 2]`,
    ].join('\n');
    expect(contratoOrigenDelError(mensaje)).toBe(TOKEN);
    expect(contratoOrigenDelError('HostError: Error(Contract, #2)')).toBeNull();
  });
});

describe('configuración y revisión de mainnet', () => {
  it('un servicio a medias avisa qué variables faltan', () => {
    expect(() => leerConfiguracion({ ...ENV_BASE, DIDIT_API_KEY: 'k' })).toThrow(/DIDIT_WORKFLOW_ID/);
    const c = leerConfiguracion(ENV_BASE);
    expect(c.servicios.didit).toBeNull();
    expect(c.servicios.mux).toBeNull();
    expect(c.stellar.rpcUrl).toMatch(/testnet/);
  });

  it('el mismo contrato en v1 y v2 no deja arrancar', () => {
    expect(() => leerConfiguracion({ ...ENV_BASE, ESCROW_CONTRACT_ID: CONTRATO, ESCROW_V2_CONTRACT_ID: CONTRATO })).toThrow(/deja ESCROW_CONTRACT_ID vacío/);
    expect(leerConfiguracion({ ...ENV_BASE, ESCROW_V2_CONTRACT_ID: CONTRATO }).stellar.contratoV2Id).toBe(CONTRATO);
  });

  it('la rampa simulada solo existe en testnet', () => {
    expect(leerConfiguracion({ ...ENV_BASE, RAMPA_SIMULADA: 'si' }).rampaSimulada).toEqual({ llaveEmisor: null });
    expect(leerConfiguracion(ENV_BASE).rampaSimulada).toBeNull();
    expect(() => leerConfiguracion({ ...ENV_BASE, STELLAR_NETWORK: 'mainnet', RAMPA_SIMULADA: 'si' })).toThrow(/solo existe en testnet/);
  });

  it('en testnet no se exige nada; en mainnet sí', () => {
    const testnet = leerConfiguracion(ENV_BASE);
    expect(revisarParaArrancar(testnet, { llavesDeEjemplo: true }).problemas).toEqual([]);

    const mainnet = leerConfiguracion({ ...ENV_BASE, STELLAR_NETWORK: 'mainnet', PAYMENT_ASSET: 'USDC de prueba', STELLAR_VERIFICAR: 'no' });
    const { problemas } = revisarParaArrancar(mainnet, { llavesDeEjemplo: true });
    const texto = problemas.join('\n');
    expect(texto).toMatch(/NODE_ENV/);
    expect(texto).toMatch(/llaves de ejemplo/);
    expect(texto).toMatch(/de prueba/);
    expect(texto).toMatch(/STELLAR_VERIFICAR/);
    expect(texto).toMatch(/KYC/);
  });

  it('una configuración de mainnet completa pasa la revisión', () => {
    const g = () => Keypair.random().publicKey();
    const c = leerConfiguracion({
      ...ENV_BASE,
      NODE_ENV: 'production',
      STELLAR_NETWORK: 'mainnet',
      PUBLIC_HOST: 'cryptoville.app',
      ESCROW_V2_CONTRACT_ID: CONTRATO,
      PAYMENT_TOKEN_ID: CONTRATO,
      PAYMENT_ASSET: 'USDC',
      ARBITRO_DIRECCION: g(),
      TESORERIA_DIRECCION: g(),
      STELLAR_RPC_URL: 'https://mainnet.sorobanrpc.com',
      ENTORNO_SERVICIOS: 'produccion',
      DIDIT_API_KEY: 'k',
      DIDIT_WORKFLOW_ID: 'w',
      DIDIT_WEBHOOK_SECRET: 's',
      KYC_HMAC_SECRET: 'h'.repeat(40),
    });
    expect(revisarConfiguracion(c, { llavesDeEjemplo: false }).problemas).toEqual([]);
  });

  it('detecta llaves secretas en el archivo de ejemplo (y no en el archivo vacío de Docker)', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cv-'));
    const vacio = path.join(dir, 'vacio.json');
    const conLlaves = path.join(dir, 'llaves.json');
    writeFileSync(vacio, JSON.stringify({ nota: 'vacío', usuarios: [] }));
    writeFileSync(conLlaves, JSON.stringify({ usuarios: [{ secreta: Keypair.random().secret() }] }));
    expect(hayLlavesDeEjemplo([vacio])).toBe(false);
    expect(hayLlavesDeEjemplo([conLlaves])).toBe(true);
    expect(hayLlavesDeEjemplo([path.join(dir, 'no-existe.json')])).toBe(false);
  });
});
