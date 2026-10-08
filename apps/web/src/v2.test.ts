// Pruebas de la lógica de Cryptoville v2 en la web (sin navegador).
import { DOCUMENTOS_LEGALES, PASSPHRASE, REGLAS, nombreSector, porcentajeBps, sectorDeLote, loteEnSector } from '@cryptoville/shared';
import { Account, BASE_FEE, Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { firmarTransaccionLocal } from './features/auth/firma-local';
import { leerDocumento, TEXTOS, trozos, valoresDeReglas } from './legal/documentos';

describe('documentos legales', () => {
  it('la versión de cada archivo coincide con la del paquete compartido', () => {
    for (const d of DOCUMENTOS_LEGALES) {
      expect(leerDocumento(TEXTOS[d.id], {}).version, d.id).toBe(d.version);
    }
  });

  it('todos los números salen del archivo de reglas (no queda ningún {{valor}} sin reemplazar)', () => {
    for (const red of ['testnet', 'mainnet'] as const) {
      const valores = valoresDeReglas(REGLAS[red], red);
      for (const d of DOCUMENTOS_LEGALES) {
        const texto = JSON.stringify(leerDocumento(TEXTOS[d.id], valores).bloques);
        expect(texto, `${d.id} en ${red}`).not.toMatch(/\{\{/);
      }
    }
    const comisiones = leerDocumento(TEXTOS.comisiones, valoresDeReglas(REGLAS.testnet, 'testnet'));
    const tabla = comisiones.bloques.find((b) => b.tipo === 'tabla');
    expect(tabla && tabla.tipo === 'tabla' ? tabla.filas.length : 0).toBe(4);
    expect(JSON.stringify(comisiones.bloques)).toContain(porcentajeBps(REGLAS.testnet.comisiones.garantiaBps));
  });

  it('cada documento marca en rojo al menos una parte para el abogado', () => {
    for (const d of DOCUMENTOS_LEGALES) {
      expect(leerDocumento(TEXTOS[d.id], {}).bloques.some((b) => b.tipo === 'abogado'), d.id).toBe(true);
    }
  });

  it('el formato solo acepta enlaces https y no deja pasar HTML', () => {
    expect(trozos('Mira [esto](https://stellar.org) y **esto**')).toEqual([
      { tipo: 'texto', texto: 'Mira ' },
      { tipo: 'enlace', texto: 'esto', url: 'https://stellar.org' },
      { tipo: 'texto', texto: ' y ' },
      { tipo: 'negrita', texto: 'esto' },
    ]);
    expect(trozos('[malo](javascript:alert(1))').some((t) => t.tipo === 'enlace')).toBe(false);
  });
});

describe('reglas', () => {
  it('porcentajes legibles', () => {
    expect(porcentajeBps(300)).toBe('3%');
    expect(porcentajeBps(150)).toBe('1.5%');
    expect(porcentajeBps(100)).toBe('1%');
  });

  it('sectores de 60 casas: «Creativo», «Creativo B»…', () => {
    expect(sectorDeLote(1)).toBe(1);
    expect(sectorDeLote(60)).toBe(1);
    expect(sectorDeLote(61)).toBe(2);
    expect(loteEnSector(61)).toBe(1);
    expect(loteEnSector(120)).toBe(60);
    expect(nombreSector('Creativo', 1)).toBe('Creativo');
    expect(nombreSector('Creativo', 2)).toBe('Creativo B');
    expect(nombreSector('Creativo', 26)).toBe('Creativo Z');
    expect(nombreSector('Creativo', 27)).toBe('Creativo AA');
  });
});

describe('firma de transacciones con una llave de prueba (modo desarrollo)', () => {
  it('firma la misma transacción que armó la API', async () => {
    const par = Keypair.random();
    const tx = new TransactionBuilder(new Account(par.publicKey(), '1'), { fee: BASE_FEE, networkPassphrase: PASSPHRASE.testnet })
      .addOperation(Operation.bumpSequence({ bumpTo: '5' }))
      .setTimeout(60)
      .build();
    const firmada = TransactionBuilder.fromXDR(await firmarTransaccionLocal(par.secret(), tx.toXDR(), PASSPHRASE.testnet), PASSPHRASE.testnet);
    expect(firmada.signatures).toHaveLength(1);
    expect(Buffer.from(firmada.hash()).toString('hex')).toBe(Buffer.from(tx.hash()).toString('hex'));
  });
});
