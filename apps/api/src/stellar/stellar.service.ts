import { BadRequestException, Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ERRORES_CONTRATO, PASSPHRASE } from '@cryptoville/shared';
import { Account, Address, BASE_FEE, Contract, Keypair, TransactionBuilder, nativeToScVal, rpc, scValToNative, type Transaction, type xdr } from '@stellar/stellar-sdk';
import { CONFIGURACION, type Configuracion } from '../config/configuracion';
import { codigoErrorContrato, contratoOrigenDelError, hashDe, transaccionDeXdr } from './cadena';

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type TransaccionConfirmada = rpc.Api.GetSuccessfulTransactionResponse;

/** Errores del contrato v2 que no existen en el v1 (los mismos números del v1 significan lo mismo). */
const ERRORES_EXTRA: Record<number, string> = {
  11: 'El contrato está en pausa: por ahora no se pueden crear pedidos nuevos.',
  12: 'El monto pasa del tope por pedido del contrato.',
  13: 'El plan de fases no es válido (entre 1 y 5 fases, montos mayores que cero y fechas en orden).',
  14: 'Esa fase no existe en el pedido.',
  15: 'Primero tienen que entregarse las fases anteriores.',
  16: 'Ya no se pueden pedir más cambios en esta fase.',
  17: 'No hay una actualización del contrato pendiente.',
  18: 'Todavía no pasaron los días de aviso de la actualización.',
};

/**
 * Lectura de la red de Stellar (RPC de Soroban).
 *
 * - Arma transacciones SIN firmar para que las firme la wallet de la persona.
 * - Envía transacciones YA firmadas y espera la confirmación.
 * - Lee transacciones, eventos y el estado de los contratos para verificar los pagos.
 *
 * El servidor nunca firma por nadie. La única excepción es la llave de mantenimiento
 * (ver `firmarMantenimiento`), que solo ejecuta vencimientos y solo tiene XLM para las comisiones.
 */
@Injectable()
export class StellarService {
  private readonly log = new Logger('Stellar');
  private readonly servidor: rpc.Server;

  constructor(@Inject(CONFIGURACION) private readonly config: Configuracion) {
    this.servidor = new rpc.Server(config.stellar.rpcUrl, { allowHttp: config.stellar.rpcUrl.startsWith('http://') });
  }

  get passphrase(): string {
    return PASSPHRASE[this.config.stellar.red];
  }

  /** ¿Se verifican los pasos en la red? (hace falta el RPC y al menos un contrato). */
  get verifica(): boolean {
    const s = this.config.stellar;
    return s.verificar && Boolean(s.contratoId || s.contratoV2Id);
  }

  /** ¿Se verifican en la red los pagos a la plataforma (local extra)? Solo hace falta el RPC. */
  get verificaPagos(): boolean {
    return this.config.stellar.verificar;
  }

  /** ¿Se pueden armar transacciones para firmar en la app? */
  get armaTransacciones(): boolean {
    return Boolean(this.config.stellar.contratoId || this.config.stellar.contratoV2Id) && this.config.entorno !== 'test';
  }

  async cuenta(direccion: string): Promise<Account> {
    try {
      return await this.servidor.getAccount(direccion);
    } catch (e) {
      if (/not found|404/i.test(String((e as Error).message))) {
        throw new BadRequestException(
          this.config.stellar.red === 'testnet'
            ? 'Tu wallet todavía no existe en la red: fondéala con XLM de prueba (Friendbot en Stellar Lab) y vuelve a intentar'
            : 'Tu wallet todavía no existe en la red: necesita un poco de XLM para activarse',
        );
      }
      throw this.sinRed(e);
    }
  }

  /** Arma (y simula) una llamada al contrato para que la firme `fuente`. */
  async preparar(fuente: string, contrato: string, funcion: string, args: xdr.ScVal[]): Promise<{ xdr: string; hash: string }> {
    const cuenta = await this.cuenta(fuente);
    const tx = new TransactionBuilder(cuenta, { fee: BASE_FEE, networkPassphrase: this.passphrase })
      .addOperation(new Contract(contrato).call(funcion, ...args))
      .setTimeout(300)
      .build();
    let preparada: Transaction;
    try {
      preparada = (await this.servidor.prepareTransaction(tx)) as Transaction;
    } catch (e) {
      throw this.errorDeSimulacion(e);
    }
    return { xdr: preparada.toXDR(), hash: hashDe(preparada) };
  }

  /** Envía una transacción firmada y espera a que la red la confirme. */
  async enviar(xdrFirmado: string): Promise<TransaccionConfirmada> {
    let tx: Transaction;
    try {
      tx = transaccionDeXdr(xdrFirmado, this.passphrase);
    } catch {
      throw new BadRequestException('La transacción firmada no se pudo leer');
    }
    let envio: rpc.Api.SendTransactionResponse;
    try {
      envio = await this.servidor.sendTransaction(TransactionBuilder.fromXDR(xdrFirmado, this.passphrase));
    } catch (e) {
      throw this.sinRed(e);
    }
    if (envio.status === 'ERROR') {
      const codigo = envio.errorResult?.result.type ?? 'desconocido';
      throw new BadRequestException(`La red rechazó la transacción (${codigo}). Revisa que tu wallet tenga XLM para la comisión.`);
    }
    if (envio.status === 'TRY_AGAIN_LATER') throw new ServiceUnavailableException('La red está ocupada; intenta de nuevo en unos segundos');
    const r = await this.esperar(hashDe(tx), 30);
    if (r.status === rpc.Api.GetTransactionStatus.SUCCESS) return r;
    if (r.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new BadRequestException(this.textoFallida(r));
    }
    throw new ServiceUnavailableException('La red todavía no confirma la transacción; revisa en unos minutos en «Mis pedidos»');
  }

  /** Busca una transacción por su hash (con algunos reintentos: la red tarda unos segundos en verla). */
  async esperar(hash: string, intentos = 5): Promise<rpc.Api.GetTransactionResponse> {
    let ultima: rpc.Api.GetTransactionResponse | null = null;
    for (let i = 0; i < intentos; i++) {
      try {
        ultima = await this.servidor.getTransaction(hash);
      } catch (e) {
        throw this.sinRed(e);
      }
      if (ultima.status !== rpc.Api.GetTransactionStatus.NOT_FOUND) return ultima;
      if (i < intentos - 1) await espera(1000);
    }
    return ultima!;
  }

  /** Llama a una función de solo lectura del contrato (simulación, sin firmar ni pagar). */
  async leer(contrato: string, funcion: string, args: xdr.ScVal[] = []): Promise<unknown> {
    const fuente = this.config.stellar.arbitro ?? this.config.stellar.tesoreria;
    if (!fuente) throw new ServiceUnavailableException('Falta ARBITRO_DIRECCION para leer el contrato');
    const tx = new TransactionBuilder(new Account(fuente, '0'), { fee: BASE_FEE, networkPassphrase: this.passphrase })
      .addOperation(new Contract(contrato).call(funcion, ...args))
      .setTimeout(60)
      .build();
    let sim: rpc.Api.SimulateTransactionResponse;
    try {
      sim = await this.servidor.simulateTransaction(tx);
    } catch (e) {
      throw this.sinRed(e);
    }
    if (rpc.Api.isSimulationError(sim)) {
      const codigo = codigoErrorContrato(sim.error);
      if (codigo === 2) return null; // PedidoNoExiste
      throw this.errorDeSimulacion(new Error(sim.error));
    }
    const valor = (sim as rpc.Api.SimulateTransactionSuccessResponse).result?.retval;
    return valor ? scValToNative(valor) : null;
  }

  async eventos(contrato: string, desde: { cursor: string } | { ledger: number }, limite = 100) {
    const filtros: rpc.Api.EventFilter[] = [{ type: 'contract', contractIds: [contrato] }];
    const pedido: rpc.Api.GetEventsRequest =
      'cursor' in desde ? { filters: filtros, cursor: desde.cursor, limit: limite } : { filters: filtros, startLedger: desde.ledger, limit: limite };
    return this.servidor.getEvents(pedido);
  }

  async ultimoLedger(): Promise<number> {
    return (await this.servidor.getLatestLedger()).sequence;
  }

  /**
   * Firma y envía con la llave de mantenimiento. SOLO para funciones del contrato v2 que cualquiera puede llamar
   * y que siempre mandan el dinero a quien corresponde (vencimientos y `extender`).
   */
  async firmarMantenimiento(contrato: string, funcion: string, args: xdr.ScVal[]): Promise<TransaccionConfirmada | null> {
    const secreta = this.config.stellar.llaveMantenimiento;
    if (!secreta) return null;
    if (!['cobrar_por_vencimiento', 'reembolsar_por_vencimiento', 'resolver_por_vencimiento', 'extender'].includes(funcion)) {
      throw new Error(`La llave de mantenimiento no puede llamar a "${funcion}"`);
    }
    const par = Keypair.fromSecret(secreta);
    const { xdr: sinFirmar } = await this.preparar(par.publicKey(), contrato, funcion, args);
    const tx = TransactionBuilder.fromXDR(sinFirmar, this.passphrase) as Transaction;
    tx.sign(par);
    return this.enviar(tx.toXDR());
  }

  /**
   * Rampa SIMULADA (solo testnet): emite USDC de prueba a una wallet, como si una rampa real hubiera recibido
   * los bolivianos. Solo puede llamar a `mint` del token de pago, y solo con RAMPA_SIMULADA=si en testnet.
   */
  async emitirParaRampaSimulada(llaveEmisor: string, destino: string, unidades: string): Promise<{ hash: string; confirmada: TransaccionConfirmada }> {
    const { red, tokenId } = this.config.stellar;
    if (red !== 'testnet' || !this.config.rampaSimulada) throw new Error('La rampa simulada solo existe en testnet');
    if (!tokenId) throw new ServiceUnavailableException('Falta PAYMENT_TOKEN_ID');
    const par = Keypair.fromSecret(llaveEmisor);
    const { xdr: sinFirmar } = await this.preparar(par.publicKey(), tokenId, 'mint', [new Address(destino).toScVal(), nativeToScVal(BigInt(unidades), { type: 'i128' })]);
    const tx = TransactionBuilder.fromXDR(sinFirmar, this.passphrase) as Transaction;
    tx.sign(par);
    return { hash: hashDe(tx), confirmada: await this.enviar(tx.toXDR()) };
  }

  private textoFallida(r: rpc.Api.GetFailedTransactionResponse): string {
    const codigo = r.resultXdr?.result.type ?? '';
    return `La transacción falló en la red${codigo ? ` (${codigo})` : ''}. Revisa los datos y vuelve a intentar.`;
  }

  private errorDeSimulacion(e: unknown): BadRequestException {
    const mensaje = String((e as Error)?.message ?? e);
    const codigo = codigoErrorContrato(mensaje);
    if (codigo !== null && this.config.stellar.tokenId && contratoOrigenDelError(mensaje) === this.config.stellar.tokenId) {
      // Falló el token (casi siempre por saldo): sus números de error no son los del escrow.
      return new BadRequestException('Tu wallet no tiene USDC suficiente para este pago. Recarga y vuelve a intentar.');
    }
    if (codigo !== null) {
      const texto = ERRORES_CONTRATO[codigo]?.explicacion ?? ERRORES_EXTRA[codigo] ?? `Error #${codigo} del contrato.`;
      return new BadRequestException(`El contrato no lo permite: ${texto}`);
    }
    this.log.warn(`Simulación fallida: ${mensaje.slice(0, 300)}`);
    return new BadRequestException('La red no aceptó esta operación (falló la simulación). Revisa tu saldo y vuelve a intentar.');
  }

  private sinRed(e: unknown): ServiceUnavailableException {
    this.log.warn(`Sin respuesta del RPC: ${String((e as Error)?.message ?? e).slice(0, 200)}`);
    return new ServiceUnavailableException('No pudimos conectarnos con la red de Stellar; intenta de nuevo en un momento');
  }
}
