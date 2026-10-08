import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ACCIONES_FASE,
  FASES_FINALES,
  NOMBRE_METODO,
  aSegundosUnix,
  estadoPedidoDesdeFases,
  formatoUsdc,
  montosDeFases,
  pruebasQueFaltan,
  puedeHacerEnFase,
  reglasDe,
  textoHuellaEntrega,
  unidadesAUsdc,
  usdcAUnidades,
  validarPlan,
  type AccionFase,
  type EstadoFase,
  type FuncionV2,
  type MetodoPago,
  type PlanFase,
  type TipoPrueba,
} from '@cryptoville/shared';
import { rpc, type xdr } from '@stellar/stellar-sdk';
import { createHash, randomUUID } from 'node:crypto';
import { AvisosService } from '../avisos/avisos.service';
import { CONFIGURACION, type Configuracion } from '../config/configuracion';
import type { AccionPedido, Fase, Prisma, TipoAviso, Usuario } from '../generated/prisma/client';
import { OrdersService, type PedidoCompleto } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { arg, invocacionDeSobre } from '../stellar/cadena';
import { StellarService, type TransaccionConfirmada } from '../stellar/stellar.service';
import { direccionesDe } from '../stellar/verificador.service';
import { SupabaseService } from '../supabase/supabase.service';
import { VideosService } from '../videos/videos.module';
import { walletParaCobrar } from '../wallets/wallets.module';
import { argumentosCrearV2, fasesDesdeContrato, verificarInvocacionV2, type FaseEnContrato } from './cadena-v2';

const sha256 = (datos: string | Buffer) => createHash('sha256').update(datos).digest('hex');
const EXTENSION: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'text/plain': 'txt',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
};

export type ResultadoDisputa = 'Cliente' | 'Proveedor' | 'Mitad';

/** Lo que guarda la transacción preparada para registrar el paso cuando vuelve firmada. */
export interface DatosPasoV2 {
  funcion: FuncionV2;
  fase?: number;
  resultado?: ResultadoDisputa;
  motivo?: string;
  decision?: string;
}

export interface NuevaPrueba {
  fase: number;
  tipo: TipoPrueba;
  titulo: string;
  ruta?: string;
  url?: string;
  video_id?: string;
  para?: 'entrega' | 'disputa';
}

/**
 * Pagos de Cryptoville v2: métodos de pago, plan de fases, pago directo, pruebas y el contrato v2.
 * - El contrato es la fuente de verdad del dinero: después de cada transacción la API lee el pedido
 *   en el contrato (`pedido(id)`) y deja las fases de la base igual que en la red.
 * - Si el contrato v2 no está configurado (ESCROW_V2_CONTRACT_ID), solo existe el pago con garantía del v1.
 */
@Injectable()
export class PagosService {
  private readonly log = new Logger('Pagos');

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly stellar: StellarService,
    private readonly avisos: AvisosService,
    private readonly supabase: SupabaseService,
    private readonly videos: VideosService,
    @Inject(CONFIGURACION) private readonly config: Configuracion,
  ) {}

  get contratoV2(): string | null {
    return this.config.stellar.contratoV2Id;
  }

  private get reglas() {
    return reglasDe(this.config.stellar.red);
  }

  /** Métodos que se pueden elegir en este servidor (directo y por etapas necesitan el contrato v2). */
  metodosDisponibles(): MetodoPago[] {
    return this.contratoV2 ? ['directo', 'garantia', 'etapas'] : ['garantia'];
  }

  /** Contrato que corresponde a un pedido nuevo con ese método. */
  contratoPara(metodo: MetodoPago): 'v1' | 'v2' {
    if (metodo !== 'garantia') {
      if (!this.contratoV2) throw new BadRequestException(`«${NOMBRE_METODO[metodo]}» todavía no está disponible en este servidor`);
      return 'v2';
    }
    return this.contratoV2 ? 'v2' : 'v1';
  }

  // ---------------------------------------------------------------
  // Método y plan (antes de pagar)
  // ---------------------------------------------------------------

  /** El cliente cambia el método antes de que el proveedor acepte. */
  async cambiarMetodo(yo: Usuario, id: string, metodo: MetodoPago) {
    const { pedido, rol } = await this.orders.cargarVisible(id, yo);
    if (rol !== 'cliente') throw new ForbiddenException('Solo el cliente elige cómo pagar');
    if (pedido.estado !== 'solicitado') throw new ConflictException('El método se elige antes de que el proveedor acepte');
    return this.prisma.pedido.update({ where: { id }, data: { metodo_pago: metodo, contrato: this.contratoPara(metodo) } });
  }

  /** Garantía en el contrato v2: el plan es una sola fase, sin aprobación aparte. */
  async crearFaseUnica(pedidoId: string): Promise<void> {
    const p = await this.prisma.pedido.findUniqueOrThrow({ where: { id: pedidoId } });
    if (!p.fecha_limite) return;
    await this.prisma.$transaction([
      this.prisma.fase.deleteMany({ where: { pedido_id: pedidoId } }),
      this.prisma.fase.create({
        data: {
          pedido_id: pedidoId,
          numero: 0,
          descripcion: 'Todo el trabajo',
          porcentaje_proyecto: 100,
          porcentaje_pago: 100,
          monto_usdc: p.monto_usdc,
          fecha_limite: p.fecha_limite,
          pruebas: [],
        },
      }),
      this.prisma.pedido.update({ where: { id: pedidoId }, data: { plan_aceptado_en: new Date() } }),
    ]);
  }

  /**
   * Por etapas: el proveedor acepta el pedido con su plan (o lo corrige si el cliente pidió cambios).
   * El cliente lo tiene que aceptar antes de pagar.
   */
  async proponerPlan(yo: Usuario, id: string, plan: PlanFase[], montoUsdc?: string) {
    const { pedido, rol } = await this.orders.cargarVisible(id, yo);
    if (rol !== 'proveedor') throw new ForbiddenException('El plan lo arma el proveedor');
    if (pedido.metodo_pago !== 'etapas') throw new BadRequestException('Este pedido no es por etapas');
    if (pedido.estado === 'aceptado' && pedido.plan_aceptado_en) throw new ConflictException('El cliente ya aceptó el plan');
    if (pedido.estado !== 'solicitado' && pedido.estado !== 'aceptado') throw new ConflictException('El plan solo se arma antes de pagar');
    const monto = montoUsdc ?? formatoUsdc(String(pedido.monto_usdc));
    this.validarPlanConMonto(plan, monto);
    const ultima = new Date(plan.at(-1)!.fecha_limite);

    await this.prisma.$transaction(async (tx) => {
      if (pedido.estado === 'solicitado') {
        await this.orders.moverEstado(
          pedido,
          'aceptar',
          { fecha_limite: ultima, monto_usdc: monto, direccion_proveedor: await walletParaCobrar(this.prisma, pedido.proveedor) },
          tx,
        );
        await tx.pasoPedido.create({ data: { pedido_id: id, accion: 'aceptar', declarado_por: yo.id } });
      } else {
        await tx.pedido.update({ where: { id }, data: { fecha_limite: ultima, monto_usdc: monto, plan_comentario: null } });
      }
      await tx.fase.deleteMany({ where: { pedido_id: id } });
      await tx.fase.createMany({ data: this.filasDelPlan(id, plan, monto) });
    });
    await this.avisos.crear(
      pedido.cliente_id,
      'plan_propuesto',
      `${yo.nombre} propuso un plan de ${plan.length} fases por ${monto} USDC para el pedido #${pedido.numero}. Revísalo y acéptalo para pagar.`,
      id,
    );
    return this.orders.cargar(id);
  }

  /** Lanza un error en español si el plan no es válido o el monto no se puede cobrar. */
  validarPlanConMonto(plan: readonly PlanFase[], monto: string): void {
    const error = validarPlan(plan, this.reglas);
    if (error) throw new BadRequestException(error);
    if (Number(monto) <= 0) throw new BadRequestException('El precio tiene que ser mayor que 0');
    this.exigirTope(monto);
  }

  /** Filas de `fases` para un plan ya validado: el monto se reparte sin perder unidades (lo que sobra va a la última). */
  filasDelPlan(pedidoId: string, plan: readonly PlanFase[], monto: string): Prisma.FaseCreateManyInput[] {
    const montos = montosDeFases(BigInt(usdcAUnidades(monto)), plan.map((f) => f.porcentaje_pago));
    return plan.map((f, i) => ({
      pedido_id: pedidoId,
      numero: i,
      descripcion: f.descripcion.trim(),
      porcentaje_proyecto: f.porcentaje_proyecto,
      porcentaje_pago: f.porcentaje_pago,
      monto_usdc: unidadesAUsdc(montos[i]),
      fecha_limite: new Date(f.fecha_limite),
      pruebas: [...new Set(f.pruebas)],
    }));
  }

  async aceptarPlan(yo: Usuario, id: string) {
    const { pedido, rol } = await this.orders.cargarVisible(id, yo);
    if (rol !== 'cliente') throw new ForbiddenException('El plan lo acepta el cliente');
    if (pedido.metodo_pago !== 'etapas' || pedido.estado !== 'aceptado') throw new ConflictException('No hay un plan para aceptar');
    if (pedido.plan_aceptado_en) throw new ConflictException('Ya aceptaste el plan');
    if (!(await this.prisma.fase.count({ where: { pedido_id: id } }))) throw new ConflictException('El proveedor todavía no armó el plan');
    await this.prisma.$transaction([
      this.prisma.pedido.update({ where: { id }, data: { plan_aceptado_en: new Date(), plan_comentario: null } }),
      this.prisma.pasoPedido.create({ data: { pedido_id: id, accion: 'aceptar_plan', declarado_por: yo.id } }),
    ]);
    await this.avisos.crear(pedido.proveedor_id, 'plan_aceptado', `${yo.nombre} aceptó tu plan del pedido #${pedido.numero}. Falta su pago.`, id);
    return this.orders.cargar(id);
  }

  async pedirCambiosPlan(yo: Usuario, id: string, comentario: string) {
    const { pedido, rol } = await this.orders.cargarVisible(id, yo);
    if (rol !== 'cliente') throw new ForbiddenException('Solo el cliente pide cambios al plan');
    if (pedido.metodo_pago !== 'etapas' || pedido.estado !== 'aceptado' || pedido.plan_aceptado_en) {
      throw new ConflictException('El plan ya no se puede cambiar');
    }
    await this.prisma.pedido.update({ where: { id }, data: { plan_comentario: comentario.trim() } });
    await this.avisos.crear(pedido.proveedor_id, 'cambios_pedidos', `${yo.nombre} pidió cambios al plan del pedido #${pedido.numero}: «${comentario.trim().slice(0, 120)}».`, id);
    return this.orders.cargar(id);
  }

  // ---------------------------------------------------------------
  // Pago directo: la entrega y la confirmación son de la app (no hay dinero que mover)
  // ---------------------------------------------------------------

  async entregadoDirecto(yo: Usuario, id: string) {
    const { pedido, rol } = await this.orders.cargarVisible(id, yo);
    if (rol !== 'proveedor') throw new ForbiddenException('La entrega la marca el proveedor');
    if (pedido.metodo_pago !== 'directo' || pedido.estado !== 'pagado') throw new ConflictException('Este pedido no espera una entrega');
    await this.cambiarEstado(pedido, 'pagado', 'entregado', 'marcar_entregado', yo);
    await this.avisos.crear(pedido.cliente_id, 'te_toca_liberar', `${yo.nombre} entregó el pedido #${pedido.numero}. Confirma que lo recibiste.`, id);
    return this.orders.cargar(id);
  }

  async recibidoDirecto(yo: Usuario, id: string) {
    const { pedido, rol } = await this.orders.cargarVisible(id, yo);
    if (rol !== 'cliente') throw new ForbiddenException('Lo confirma el cliente');
    if (pedido.metodo_pago !== 'directo' || (pedido.estado !== 'pagado' && pedido.estado !== 'entregado')) {
      throw new ConflictException('Este pedido no espera tu confirmación');
    }
    await this.cambiarEstado(pedido, pedido.estado, 'finalizado', 'confirmar_recibido', yo);
    await this.avisos.crear(pedido.proveedor_id, 'pedido_cerrado', `${yo.nombre} confirmó que recibió el pedido #${pedido.numero}.`, id);
    return this.orders.cargar(id);
  }

  private async cambiarEstado(pedido: PedidoCompleto, desde: string, hacia: 'entregado' | 'finalizado', accion: 'marcar_entregado' | 'confirmar_recibido', yo: Usuario) {
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.pedido.updateMany({ where: { id: pedido.id, estado: desde as never }, data: { estado: hacia } });
      if (r.count !== 1) throw new ConflictException('El pedido cambió mientras tanto; recarga y vuelve a intentar');
      await tx.pasoPedido.create({ data: { pedido_id: pedido.id, accion, declarado_por: yo.id } });
    });
  }

  // ---------------------------------------------------------------
  // Pruebas de las fases (y de las disputas)
  // ---------------------------------------------------------------

  private async faseDe(pedidoId: string, numero: number): Promise<Fase> {
    const fase = await this.prisma.fase.findUnique({ where: { pedido_id_numero: { pedido_id: pedidoId, numero } } });
    if (!fase) throw new NotFoundException('Esa fase no existe en el pedido');
    return fase;
  }

  /** URL firmada para subir UN archivo de prueba al bucket privado "pruebas". */
  async subidaPrueba(yo: Usuario, id: string, d: { fase: number; tipo: string; tamano: number }) {
    const { pedido, rol } = await this.orders.cargarVisible(id, yo);
    if (rol === 'arbitro') throw new ForbiddenException('El árbitro no sube pruebas');
    await this.faseDe(pedido.id, d.fase);
    const reglas = this.reglas.archivos;
    if (!reglas.pruebaTipos.includes(d.tipo)) throw new BadRequestException('Ese tipo de archivo no se acepta (imágenes, PDF, ZIP, texto o audio)');
    if (d.tamano < 1 || d.tamano > reglas.pruebaMaxBytes) throw new BadRequestException(`El archivo puede pesar hasta ${Math.round(reglas.pruebaMaxBytes / 1048576)} MB`);
    const ruta = `pedidos/${pedido.id}/${d.fase}/${yo.id}/${randomUUID()}.${EXTENSION[d.tipo]}`;
    const { data, error } = await this.supabase.admin.storage.from('pruebas').createSignedUploadUrl(ruta);
    if (error || !data) throw new InternalServerErrorException('No se pudo preparar la subida');
    return { ruta, token: data.token };
  }

  async registrarPrueba(yo: Usuario, id: string, d: NuevaPrueba) {
    const { pedido, rol } = await this.orders.cargarVisible(id, yo);
    if (rol === 'arbitro') throw new ForbiddenException('El árbitro no sube pruebas');
    const fase = await this.faseDe(pedido.id, d.fase);
    const para = d.para ?? 'entrega';
    if (para === 'entrega') {
      if (rol !== 'proveedor') throw new ForbiddenException('Las pruebas de la entrega las sube el proveedor');
      if (fase.estado !== 'en_curso' && fase.estado !== 'propuesta') throw new ConflictException('Esta fase ya se entregó');
    } else if (!['en_curso', 'entregada', 'en_disputa'].includes(fase.estado)) {
      throw new ConflictException('Las pruebas de disputa se suben mientras la fase está abierta');
    }
    const entrega = fase.cambios + 1;
    const cuantas = await this.prisma.prueba.count({ where: { pedido_id: pedido.id, fase: d.fase, para, entrega, autor_id: yo.id } });
    if (cuantas >= this.reglas.archivos.maxPorPrueba) throw new ConflictException(`Hasta ${this.reglas.archivos.maxPorPrueba} pruebas por entrega`);

    let datos: Prisma.PruebaUncheckedCreateInput;
    const base = { pedido_id: pedido.id, fase: d.fase, autor_id: yo.id, para, entrega, tipo: d.tipo, titulo: d.titulo.trim() };
    if (d.tipo === 'archivo') {
      if (!d.ruta || !d.ruta.startsWith(`pedidos/${pedido.id}/${d.fase}/${yo.id}/`)) throw new BadRequestException('El archivo tiene que subirse desde Cryptoville');
      const { data, error } = await this.supabase.admin.storage.from('pruebas').download(d.ruta);
      if (error || !data) throw new BadRequestException('No encontramos el archivo subido');
      const bytes = Buffer.from(await data.arrayBuffer());
      datos = { ...base, ruta: d.ruta, mime: data.type || null, tamano: bytes.length, huella: sha256(bytes) };
    } else if (d.tipo === 'enlace') {
      const url = (d.url ?? '').trim();
      if (!/^https:\/\/[^\s]{4,490}$/.test(url)) throw new BadRequestException('El enlace tiene que empezar con https://');
      datos = { ...base, url, huella: sha256(url) };
    } else {
      if (!this.videos.encendido) throw new ServiceUnavailableException('Los videos no están disponibles en este servidor');
      const video = d.video_id ? await this.prisma.video.findUnique({ where: { id: d.video_id } }) : null;
      if (!video || video.usuario_id !== yo.id || video.uso !== 'prueba') throw new BadRequestException('Ese video no es tuyo');
      datos = { ...base, video_id: video.id, huella: sha256(`mux:${video.mux_upload_id}`) };
    }
    return this.prisma.prueba.create({ data: datos });
  }

  async quitarPrueba(yo: Usuario, pruebaId: string) {
    const p = await this.prisma.prueba.findUnique({ where: { id: pruebaId } });
    if (!p || p.autor_id !== yo.id) throw new NotFoundException('No tienes esa prueba');
    if (p.sellada_en) throw new ConflictException('Esa prueba ya se entregó: queda en el expediente');
    await this.prisma.prueba.delete({ where: { id: p.id } });
    if (p.ruta) await this.supabase.admin.storage.from('pruebas').remove([p.ruta]);
    return { quitada: true };
  }

  /** Ver una prueba (las partes y el árbitro): URL firmada del archivo o token del video. */
  async verPrueba(yo: Usuario, pruebaId: string) {
    const p = await this.prisma.prueba.findUnique({ where: { id: pruebaId }, include: { video: true } });
    if (!p) throw new NotFoundException('No existe esa prueba');
    await this.orders.cargarVisible(p.pedido_id, yo);
    if (p.ruta) {
      const { data } = await this.supabase.admin.storage.from('pruebas').createSignedUrl(p.ruta, 600);
      return { url: data?.signedUrl?.replace(this.config.supabase.url, this.config.supabase.urlPublica) ?? null };
    }
    if (p.video) {
      const video = await this.videos.actualizar(p.video);
      return { video: this.videos.tokens(video), estado: video.estado };
    }
    return { url: p.url };
  }

  /** Huella de la entrega de una fase: SHA-256 de la lista de sus pruebas (las que verá el árbitro). */
  async huellaEntrega(pedidoId: string, fase: Fase): Promise<{ huella: string; ids: string[] }> {
    const pruebas = await this.prisma.prueba.findMany({
      where: { pedido_id: pedidoId, fase: fase.numero, para: 'entrega', entrega: fase.cambios + 1 },
      orderBy: [{ creada_en: 'asc' }, { id: 'asc' }],
    });
    const faltan = pruebasQueFaltan(fase.pruebas as TipoPrueba[], pruebas.map((p) => ({ tipo: p.tipo as TipoPrueba })));
    if (faltan.length) throw new BadRequestException(`Antes de entregar, sube las pruebas pactadas: falta ${faltan.join(', ')}`);
    return { huella: sha256(textoHuellaEntrega(pruebas.map((p) => ({ tipo: p.tipo as TipoPrueba, huella: p.huella })))), ids: pruebas.map((p) => p.id) };
  }

  // ---------------------------------------------------------------
  // Contrato v2: armar las llamadas (TransaccionesService las firma en la app)
  // ---------------------------------------------------------------

  private exigirTope(montoUsdc: string): void {
    const tope = Number(this.reglas.topePedidoUsdc);
    if (tope > 0 && Number(montoUsdc) > tope) throw new BadRequestException(`El monto pasa del tope por pedido (${tope} USDC)`);
  }

  private exigirV2(pedido: PedidoCompleto): string {
    if (pedido.contrato !== 'v2' || !this.contratoV2) throw new BadRequestException('Este pedido no es del contrato v2');
    return this.contratoV2;
  }

  /** Funciones del contrato v2 que se pueden pedir desde la app. */
  static FUNCIONES_PASO: readonly FuncionV2[] = [
    'crear_pedido',
    'pagar_directo',
    'entregar_fase',
    'liberar_fase',
    'pedir_cambios',
    'rechazar',
    'abrir_disputa',
    'resolver',
    'cobrar_por_vencimiento',
    'reembolsar_por_vencimiento',
    'resolver_por_vencimiento',
  ];

  /** Revisa que la persona pueda hacer el paso y arma los argumentos de la llamada. */
  async argumentosV2(yo: Usuario, pedido: PedidoCompleto, rol: 'cliente' | 'proveedor' | 'arbitro', direccion: string, d: DatosPasoV2): Promise<{ contrato: string; args: xdr.ScVal[] }> {
    const contrato = this.exigirV2(pedido);
    const id = arg.u64(String(pedido.numero));
    const dir = direccionesDe(pedido);
    const exigirWallet = (esperada: string, quien: string) => {
      if (direccion !== esperada) throw new BadRequestException(`Este pedido usa la wallet ${esperada.slice(0, 5)}…${esperada.slice(-5)} del ${quien}: conéctala para firmar`);
    };

    if (d.funcion === 'crear_pedido' || d.funcion === 'pagar_directo') {
      if (rol !== 'cliente') throw new ForbiddenException('El pago lo hace el cliente');
      if (pedido.estado !== 'aceptado') throw new ConflictException('El pedido todavía no está listo para pagar');
      const proveedor = pedido.direccion_proveedor ?? (await walletParaCobrar(this.prisma, pedido.proveedor));
      if (d.funcion === 'pagar_directo') {
        if (pedido.metodo_pago !== 'directo') throw new BadRequestException('Este pedido no es de pago directo');
        return { contrato, args: [arg.direccion(direccion), arg.direccion(proveedor), id, arg.i128(usdcAUnidades(formatoUsdc(String(pedido.monto_usdc))))] };
      }
      if (pedido.metodo_pago === 'directo') throw new BadRequestException('Este pedido es de pago directo');
      if (!pedido.plan_aceptado_en) throw new ConflictException('Primero acepta el plan de fases');
      const plan = await this.planEnContrato(pedido.id);
      if (!plan.length) throw new ConflictException('El pedido no tiene plan');
      if (plan.some((f) => Number(f.fechaLimiteSeg) * 1000 <= Date.now())) throw new BadRequestException('Una fecha del plan ya pasó: pide al proveedor que lo actualice');
      return { contrato, args: argumentosCrearV2(direccion, proveedor, BigInt(pedido.numero), plan) };
    }

    const fases = await this.prisma.fase.findMany({ where: { pedido_id: pedido.id }, orderBy: { numero: 'asc' } });
    if (d.funcion === 'rechazar') {
      if (rol !== 'proveedor') throw new ForbiddenException('Solo el proveedor devuelve el dinero');
      exigirWallet(dir.proveedor, 'proveedor');
      return { contrato, args: [arg.direccion(dir.proveedor), id] };
    }
    const numero = d.fase ?? -1;
    const fase = fases[numero];
    if (!fase) throw new BadRequestException('Esa fase no existe en el pedido');
    const accion = d.funcion as AccionFase;
    if (!puedeHacerEnFase(accion, fases.map((f) => ({ estado: f.estado as EstadoFase })), numero, rol)) {
      throw new ForbiddenException(`No puedes hacer «${ACCIONES_FASE[accion].etiqueta}» en esta fase ahora`);
    }
    const nFase = arg.u32(numero);
    switch (d.funcion) {
      case 'entregar_fase': {
        exigirWallet(dir.proveedor, 'proveedor');
        const { huella } = await this.huellaEntrega(pedido.id, fase);
        return { contrato, args: [arg.direccion(dir.proveedor), id, nFase, arg.bytes32(huella)] };
      }
      case 'liberar_fase':
      case 'pedir_cambios':
        exigirWallet(dir.cliente, 'cliente');
        return { contrato, args: [arg.direccion(dir.cliente), id, nFase] };
      case 'abrir_disputa':
        if (!d.motivo || d.motivo.trim().length < 10) throw new BadRequestException('Explica el motivo de la disputa (al menos 10 caracteres)');
        if (direccion !== dir.cliente && direccion !== dir.proveedor) throw new BadRequestException('Firma con la wallet que usaste en este pedido');
        return { contrato, args: [arg.direccion(direccion), id, nFase] };
      case 'resolver':
        if (pedido.cliente_id === yo.id || pedido.proveedor_id === yo.id) throw new ForbiddenException('No puedes arbitrar un pedido en el que participas');
        if (!d.resultado) throw new BadRequestException('Indica a favor de quién se resuelve (Cliente, Proveedor o Mitad)');
        if (!d.decision || d.decision.trim().length < 10) throw new BadRequestException('Explica la decisión (al menos 10 caracteres)');
        if (direccion !== this.config.stellar.arbitro) throw new BadRequestException('Firma con la wallet del árbitro del contrato');
        return { contrato, args: [arg.direccion(direccion), id, nFase, arg.variante(d.resultado)] };
      default:
        // Vencimientos: los puede firmar cualquiera (el dinero va a quien corresponde).
        return { contrato, args: [id, nFase] };
    }
  }

  private async planEnContrato(pedidoId: string): Promise<FaseEnContrato[]> {
    const fases = await this.prisma.fase.findMany({ where: { pedido_id: pedidoId }, orderBy: { numero: 'asc' } });
    return fases.map((f) => ({ monto: BigInt(usdcAUnidades(formatoUsdc(String(f.monto_usdc)))), fechaLimiteSeg: BigInt(aSegundosUnix(f.fecha_limite)) }));
  }

  /**
   * Registra un paso del contrato v2 ya confirmado en la red: verifica la transacción, deja las fases
   * igual que en el contrato y avisa a quien corresponde.
   */
  async registrarV2(yo: Usuario | null, pedidoId: string, d: DatosPasoV2, confirmada: TransaccionConfirmada) {
    const pedido = await this.orders.cargar(pedidoId);
    const contrato = this.exigirV2(pedido);
    if (await this.prisma.pasoPedido.findUnique({ where: { hash: confirmada.txHash } })) return this.orders.cargar(pedidoId);
    const inv = invocacionDeSobre(confirmada.envelopeXdr, this.stellar.passphrase);
    if (!inv) throw new BadRequestException('Esa transacción no es una llamada a un contrato');
    const walletsDe = async (u: { id: string; direccion: string }) => [u.direccion, ...(await this.prisma.wallet.findMany({ where: { usuario_id: u.id } })).map((w) => w.direccion)];
    const error = verificarInvocacionV2(inv, d.funcion, {
      contrato,
      numero: String(pedido.numero),
      walletsCliente: await walletsDe(pedido.cliente),
      walletsProveedor: pedido.direccion_proveedor ? [pedido.direccion_proveedor] : await walletsDe(pedido.proveedor),
      plan: d.funcion === 'crear_pedido' ? await this.planEnContrato(pedido.id) : undefined,
      monto: d.funcion === 'pagar_directo' ? BigInt(usdcAUnidades(formatoUsdc(String(pedido.monto_usdc)))) : undefined,
    });
    if (error) throw new BadRequestException(`La transacción no corresponde a este paso: ${error}`);

    const declarante = yo ?? (await this.declaranteDe(pedido, inv.args, d.funcion));
    const antes = await this.prisma.fase.findMany({ where: { pedido_id: pedido.id }, orderBy: { numero: 'asc' } });

    if (d.funcion === 'pagar_directo') {
      await this.prisma.$transaction(async (tx) => {
        const r = await tx.pedido.updateMany({
          where: { id: pedido.id, estado: 'aceptado' },
          data: { estado: 'pagado', direccion_cliente: inv.args[0] as string, direccion_proveedor: inv.args[1] as string },
        });
        if (r.count !== 1) throw new ConflictException('El pedido cambió mientras tanto');
        await tx.pasoPedido.create({ data: { pedido_id: pedido.id, accion: 'pagar_directo', hash: confirmada.txHash, declarado_por: declarante.id, en_cadena: true, ledger: confirmada.ledger, verificado_en: new Date() } });
      });
      await this.avisos.crear(pedido.proveedor_id, 'pago_directo', `${pedido.cliente.nombre} te pagó directo ${formatoUsdc(String(pedido.monto_usdc))} USDC (pedido #${pedido.numero}). Ya está en tu wallet.`, pedido.id);
      return this.orders.cargar(pedido.id);
    }

    if (d.funcion === 'crear_pedido') {
      await this.prisma.pedido.update({ where: { id: pedido.id }, data: { direccion_cliente: inv.args[0] as string, direccion_proveedor: inv.args[1] as string } });
    }
    const faseTx = d.fase ?? null;
    if (d.funcion === 'abrir_disputa' && faseTx !== null) {
      await this.prisma.fase.update({
        where: { pedido_id_numero: { pedido_id: pedido.id, numero: faseTx } },
        data: { motivo_disputa: d.motivo?.trim() ?? 'Disputa abierta directo en el contrato.', abierta_por: declarante.id },
      });
    }
    if (d.funcion === 'resolver' && faseTx !== null) {
      await this.prisma.fase.update({ where: { pedido_id_numero: { pedido_id: pedido.id, numero: faseTx } }, data: { decision: d.decision?.trim() ?? 'Resuelta directo en el contrato.' } });
    }
    if (d.funcion === 'entregar_fase' && faseTx !== null) {
      // Las pruebas de esta entrega quedan selladas: ya no se pueden quitar.
      const fase = antes[faseTx];
      if (fase) await this.prisma.prueba.updateMany({ where: { pedido_id: pedido.id, fase: faseTx, para: 'entrega', entrega: fase.cambios + 1, sellada_en: null }, data: { sellada_en: new Date() } });
    }
    await this.prisma.pasoPedido.create({
      data: {
        pedido_id: pedido.id,
        accion: this.accionDeFuncion(d.funcion),
        fase: faseTx,
        hash: confirmada.txHash,
        declarado_por: declarante.id,
        en_cadena: true,
        ledger: confirmada.ledger,
        verificado_en: new Date(),
      },
    });
    await this.sincronizar(pedido.id);
    await this.avisarCambios(pedido, antes, declarante);
    return this.orders.cargar(pedido.id);
  }

  private accionDeFuncion(f: FuncionV2): AccionPedido {
    if (f === 'extender') throw new BadRequestException('Ese paso no se registra');
    return f as AccionPedido;
  }

  /** Quién hizo el paso cuando llega desde el contrato (sin sesión): la wallet que firmó. */
  private async declaranteDe(pedido: PedidoCompleto, args: unknown[], funcion: FuncionV2): Promise<Pick<Usuario, 'id' | 'nombre'>> {
    const dir = direccionesDe(pedido);
    if (funcion === 'resolver') {
      const arbitro = await this.prisma.usuario.findFirst({ where: { rol: 'arbitro', NOT: { id: { in: [pedido.cliente_id, pedido.proveedor_id] } } } });
      if (arbitro) return arbitro;
    }
    const quien = typeof args[0] === 'string' ? args[0] : null;
    if (quien === dir.proveedor) return pedido.proveedor;
    return pedido.cliente;
  }

  /** Deja las fases (y el estado del pedido) igual que en el contrato v2. */
  async sincronizar(pedidoId: string): Promise<void> {
    const pedido = await this.prisma.pedido.findUniqueOrThrow({ where: { id: pedidoId } });
    if (pedido.contrato !== 'v2' || !this.contratoV2 || pedido.metodo_pago === 'directo') return;
    const enCadena = (await this.stellar.leer(this.contratoV2, 'pedido', [arg.u64(String(pedido.numero))])) as { fases: never[] } | null;
    if (!enCadena) return;
    const fases = fasesDesdeContrato(enCadena);
    await this.prisma.$transaction(async (tx) => {
      for (const [numero, f] of fases.entries()) {
        await tx.fase.updateMany({ where: { pedido_id: pedidoId, numero }, data: f });
      }
      await tx.pedido.update({ where: { id: pedidoId }, data: { estado: estadoPedidoDesdeFases(fases) } });
    });
  }

  /** Avisos de lo que cambió en las fases (después de sincronizar). */
  private async avisarCambios(pedido: PedidoCompleto, antes: Fase[], quien: Pick<Usuario, 'id' | 'nombre'>): Promise<void> {
    const despues = await this.prisma.fase.findMany({ where: { pedido_id: pedido.id }, orderBy: { numero: 'asc' } });
    const n = `#${pedido.numero}`;
    const enviar = (u: string, tipo: TipoAviso, texto: string) => this.avisos.crear(u, tipo, texto, pedido.id);
    for (const f of despues) {
      const previo = antes.find((a) => a.numero === f.numero);
      if (!previo || previo.estado === f.estado) continue;
      const fase = `la fase ${f.numero + 1}`;
      if (previo.estado === 'propuesta' && f.estado === 'en_curso') {
        if (f.numero === 0) await enviar(pedido.proveedor_id, 'te_toca_entregar', `${pedido.cliente.nombre} pagó el pedido ${n} en garantía. Ya puedes empezar.`);
      } else if (f.estado === 'entregada') {
        await enviar(pedido.cliente_id, 'fase_entregada', `${pedido.proveedor.nombre} entregó ${fase} del pedido ${n}. Revísala y libera el pago o pide cambios.`);
      } else if (f.estado === 'liberada') {
        await enviar(pedido.proveedor_id, 'fase_liberada', `Se liberó el pago de ${fase} del pedido ${n}.`);
      } else if (f.estado === 'en_curso' && previo.estado === 'entregada') {
        await enviar(pedido.proveedor_id, 'cambios_pedidos', `${pedido.cliente.nombre} pidió cambios en ${fase} del pedido ${n}.`);
      } else if (f.estado === 'en_disputa') {
        const otro = quien.id === pedido.cliente_id ? pedido.proveedor_id : pedido.cliente_id;
        await enviar(otro, 'disputa_abierta', `${quien.nombre} abrió una disputa por ${fase} del pedido ${n}. Ese dinero queda congelado.`);
        const arbitros = await this.prisma.usuario.findMany({ where: { rol: 'arbitro', NOT: { id: { in: [pedido.cliente_id, pedido.proveedor_id] } } }, select: { id: true } });
        for (const a of arbitros) await enviar(a.id, 'disputa_abierta', `Nueva disputa por ${fase} del pedido ${n}.`);
      } else if (f.estado === 'resuelta') {
        const texto = `Se resolvió la disputa de ${fase} del pedido ${n}${f.ganador === 'Mitad' ? ': mitad y mitad' : ` a favor del ${f.ganador === 'Cliente' ? 'cliente' : 'proveedor'}`}.`;
        await enviar(pedido.cliente_id, 'disputa_resuelta', texto);
        await enviar(pedido.proveedor_id, 'disputa_resuelta', texto);
      } else if (f.estado === 'reembolsada') {
        await enviar(pedido.cliente_id, 'pedido_cerrado', `Se te devolvió el dinero de ${fase} del pedido ${n}.`);
        await enviar(pedido.proveedor_id, 'pedido_cerrado', `Se devolvió al cliente el dinero de ${fase} del pedido ${n}.`);
      }
    }
    if (despues.length && despues.every((f) => FASES_FINALES.includes(f.estado as EstadoFase)) && antes.some((f) => !FASES_FINALES.includes(f.estado as EstadoFase))) {
      await enviar(pedido.cliente_id, 'pedido_cerrado', `El pedido ${n} terminó. Puedes dejar una reseña.`);
      await enviar(pedido.proveedor_id, 'pedido_cerrado', `El pedido ${n} terminó. Puedes dejar una reseña.`);
    }
  }

  /**
   * Pasos del v2 hechos en Stellar Lab: se pega el hash y la API lo verifica en la red.
   * (Firmar en la app es lo recomendado; esto queda como opción avanzada.)
   */
  async declararV2(yo: Usuario, pedidoId: string, d: DatosPasoV2 & { hash: string }) {
    const respuesta = await this.stellar.esperar(d.hash.toLowerCase());
    if (respuesta.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
      throw new BadRequestException(
        respuesta.status === rpc.Api.GetTransactionStatus.FAILED ? 'Esa transacción falló en la red: el contrato no cambió' : 'No encontramos esa transacción en la red todavía',
      );
    }
    return this.registrarV2(yo, pedidoId, d, respuesta);
  }

  /** Expediente del pedido (para las partes y el árbitro): plan, pruebas por fase e historial. */
  async expediente(yo: Usuario, pedidoId: string) {
    const { pedido } = await this.orders.cargarVisible(pedidoId, yo);
    const [fases, pruebas, pasos] = await Promise.all([
      this.prisma.fase.findMany({ where: { pedido_id: pedido.id }, orderBy: { numero: 'asc' } }),
      this.prisma.prueba.findMany({ where: { pedido_id: pedido.id }, orderBy: [{ fase: 'asc' }, { creada_en: 'asc' }], include: { video: { select: { estado: true } } } }),
      this.prisma.pasoPedido.findMany({ where: { pedido_id: pedido.id }, orderBy: { creado_en: 'asc' } }),
    ]);
    return { pedido, fases, pruebas, pasos };
  }
}
