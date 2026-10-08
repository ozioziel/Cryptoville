// Pruebas sin red del contrato v2: argumentos, verificación de transacciones y lectura de las fases.
import { PASSPHRASE } from '@cryptoville/shared';
import { Account, BASE_FEE, Contract, Keypair, TransactionBuilder, nativeToScVal, scValToNative, xdr } from '@stellar/stellar-sdk';
import { argumentosCrearV2, fasesDesdeContrato, verificarInvocacionV2 } from '../src/pagos/cadena-v2';
import { firmaMuxValida, tokenMux } from '../src/videos/videos.module';
import { arg, invocacionDe } from '../src/stellar/cadena';
import { createHmac, generateKeyPairSync, createVerify } from 'node:crypto';

const CONTRATO = 'CCRQGMOX6H2XSGGCY536IONZNRR47RCPMKH7Z4U3SP3JC5L6HHF7AVS7';
const cliente = Keypair.random().publicKey();
const proveedor = Keypair.random().publicKey();

function invocacion(funcion: string, args: xdr.ScVal[]) {
  const tx = new TransactionBuilder(new Account(cliente, '1'), { fee: BASE_FEE, networkPassphrase: PASSPHRASE.testnet })
    .addOperation(new Contract(CONTRATO).call(funcion, ...args))
    .setTimeout(60)
    .build();
  return invocacionDe(tx)!;
}

const plan = [
  { monto: 30_000_000n, fechaLimiteSeg: 1_800_000_000n },
  { monto: 70_000_000n, fechaLimiteSeg: 1_800_600_000n },
];
const contexto = { contrato: CONTRATO, numero: '1790000000123', walletsCliente: [cliente], walletsProveedor: [proveedor], plan };

describe('verificación de transacciones del contrato v2', () => {
  it('acepta crear el pedido con el plan acordado', () => {
    const inv = invocacion('crear_pedido', argumentosCrearV2(cliente, proveedor, 1790000000123n, plan));
    expect(verificarInvocacionV2(inv, 'crear_pedido', contexto)).toBeNull();
  });

  it('rechaza otro plan, otro proveedor, otro pedido u otra función', () => {
    const otroPlan = argumentosCrearV2(cliente, proveedor, 1790000000123n, [plan[0], { ...plan[1], monto: 1n }]);
    expect(verificarInvocacionV2(invocacion('crear_pedido', otroPlan), 'crear_pedido', contexto)).toMatch(/fase 2/);
    const otroProveedor = argumentosCrearV2(cliente, Keypair.random().publicKey(), 1790000000123n, plan);
    expect(verificarInvocacionV2(invocacion('crear_pedido', otroProveedor), 'crear_pedido', contexto)).toMatch(/proveedor/);
    const otroPedido = argumentosCrearV2(cliente, proveedor, 5n, plan);
    expect(verificarInvocacionV2(invocacion('crear_pedido', otroPedido), 'crear_pedido', contexto)).toMatch(/número/);
    const liberar = invocacion('liberar_fase', [arg.direccion(cliente), arg.u64('1790000000123'), arg.u32(0)]);
    expect(verificarInvocacionV2(liberar, 'entregar_fase', contexto)).toMatch(/llama a/);
    expect(verificarInvocacionV2(liberar, 'liberar_fase', contexto)).toBeNull();
    expect(verificarInvocacionV2(liberar, 'liberar_fase', { ...contexto, contrato: 'COTRO' })).toMatch(/otro contrato/);
  });

  it('el pago directo tiene que ser por el monto acordado', () => {
    const args = [arg.direccion(cliente), arg.direccion(proveedor), arg.u64('1790000000123'), arg.i128(50_000_000n)];
    expect(verificarInvocacionV2(invocacion('pagar_directo', args), 'pagar_directo', { ...contexto, monto: 50_000_000n })).toBeNull();
    expect(verificarInvocacionV2(invocacion('pagar_directo', args), 'pagar_directo', { ...contexto, monto: 1n })).toMatch(/monto/);
  });

  it('los vencimientos llevan el número de pedido primero', () => {
    const inv = invocacion('cobrar_por_vencimiento', [arg.u64('1790000000123'), arg.u32(1)]);
    expect(verificarInvocacionV2(inv, 'cobrar_por_vencimiento', contexto)).toBeNull();
  });
});

describe('lectura de las fases del contrato', () => {
  it('convierte estados, fechas, huellas y ganadores', () => {
    const huella = new Uint8Array(32).fill(7);
    const pedido = {
      fases: [
        { monto: 1n, fecha_limite: 1_800_000_000n, estado: ['Entregada'], entregada_en: 1_799_000_000n, huella, cambios: 1, disputa_desde: 0n, ganador: ['Ninguno'] },
        { monto: 2n, fecha_limite: 1_800_100_000n, estado: ['Resuelta'], entregada_en: 0n, huella: new Uint8Array(32), cambios: 0, disputa_desde: 1_799_500_000n, ganador: ['Mitad'] },
      ],
    };
    const [a, b] = fasesDesdeContrato(pedido);
    expect(a.estado).toBe('entregada');
    expect(a.huella).toBe('07'.repeat(32));
    expect(a.entregada_en?.toISOString()).toBe(new Date(1_799_000_000_000).toISOString());
    expect(a.ganador).toBeNull();
    expect(b.estado).toBe('resuelta');
    expect(b.huella).toBeNull();
    expect(b.entregada_en).toBeNull();
    expect(b.ganador).toBe('Mitad');
  });

  it('las estructuras del plan se arman como las espera Soroban', () => {
    const [, , id, fases] = argumentosCrearV2(cliente, proveedor, 7n, plan);
    expect(scValToNative(id)).toBe(7n);
    expect(scValToNative(fases)).toEqual([
      { fecha_limite: 1_800_000_000n, monto: 30_000_000n },
      { fecha_limite: 1_800_600_000n, monto: 70_000_000n },
    ]);
    expect(nativeToScVal).toBeDefined();
  });
});

describe('videos (Mux)', () => {
  it('la firma del webhook se comprueba con la hora y el cuerpo', () => {
    const cuerpo = Buffer.from('{"type":"video.asset.ready"}');
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac('sha256', 'secreto').update(`${t}.`).update(cuerpo).digest('hex');
    expect(firmaMuxValida('secreto', cuerpo, `t=${t},v1=${v1}`)).toBe(true);
    expect(firmaMuxValida('secreto', Buffer.from('{}'), `t=${t},v1=${v1}`)).toBe(false);
    expect(firmaMuxValida('secreto', cuerpo, `t=${t - 3600},v1=${v1}`)).toBe(false);
    expect(firmaMuxValida('secreto', cuerpo, undefined)).toBe(false);
  });

  it('el token para ver un video privado es un JWT RS256 válido', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
    const token = tokenMux({ keyId: 'clave1', llavePrivadaBase64: Buffer.from(pem).toString('base64'), playbackId: 'abc', aud: 'v' });
    const [cabecera, cuerpo, firma] = token.split('.');
    const datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString());
    expect(JSON.parse(Buffer.from(cabecera, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT', kid: 'clave1' });
    expect(datos).toEqual(expect.objectContaining({ sub: 'abc', aud: 'v' }));
    expect(createVerify('RSA-SHA256').update(`${cabecera}.${cuerpo}`).verify(publicKey, Buffer.from(firma, 'base64url'))).toBe(true);
  });
});
