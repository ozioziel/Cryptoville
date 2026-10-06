// Datos de ejemplo de Cryptoville: 5 usuarios (uno es el árbitro) con local, servicios,
// pedidos en distintos estados, mensajes, una disputa resuelta y reseñas.
// Cada usuario tiene su persona y su casa personalizadas, en su villa y con su categoría.
// También hay «Se busca» abiertos (lo que la gente necesita), algunos con propuestas.
//
// - Las wallets salen de .seed-keys.json (npm run seed:keys).
// - Los pedidos cerrados son "de ejemplo" (es_ejemplo = true): no tienen transacciones reales.
//   Los pedidos "solicitado" y "aceptado" sí se pueden continuar de verdad en Stellar Lab.
// - Si la base ya tiene usuarios que NO son de ejemplo, el seed se detiene (usa --forzar para borrar todo).
//
// Uso: npm run db:seed   (o npm run db:seed -- --forzar)
import { config as cargarEnv } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

cargarEnv({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

import { PrismaPg } from '@prisma/adapter-pg';
import {
  validarAparienciaCasa,
  validarAparienciaPersona,
  type AparienciaCasa,
  type AparienciaPersona,
} from '@cryptoville/shared';
import { createClient } from '@supabase/supabase-js';
import { contrasenaDeWallet, correoDeWallet } from '../src/auth/credenciales';
import { PrismaClient, type AccionPedido, type Barrio, type EstadoPedido } from '../src/generated/prisma/client';

interface LlaveEjemplo {
  clave: string;
  nombre: string;
  rol: 'usuario' | 'arbitro';
  publica: string;
}

const raiz = path.resolve(__dirname, '../../..');
const forzar = process.argv.includes('--forzar');

function requerida(nombre: string): string {
  const v = process.env[nombre];
  if (!v) throw new Error(`Falta ${nombre} en el .env`);
  return v;
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: requerida('DATABASE_URL') }) });
const supabase = createClient(requerida('SUPABASE_URL'), requerida('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const SECRETO = requerida('AUTH_PASSWORD_SECRET');
const DOMINIO = process.env.AUTH_EMAIL_DOMAIN || 'wallet.cryptoville.test';

interface Perfil {
  bio: string;
  avatar: number;
  apariencia: AparienciaPersona;
  local: { nombre: string; barrio: Barrio; lote: number; categoria: string; color: string; descripcion: string; apariencia: AparienciaCasa };
}

// Lotes numerados dentro de cada villa (1, 2, 3…).
const PERFILES: Record<string, Perfil> = {
  arbitro: {
    bio: 'Equipo de Cryptoville. Resolvemos disputas y te ayudamos a usar Stellar Lab.',
    avatar: 84,
    apariencia: {
      piel: 'piel-3', peinado: 'lateral', colorPelo: 'negro', barba: 'ninguna', arriba: 'camisa', colorArriba: 'marino',
      abajo: 'pantalon', colorAbajo: 'carbon', zapatos: 'zapatos-negros', lentes: 'redondos', gorro: 'ninguno', colorGorro: 'gris', objeto: 'libro',
    },
    local: {
      nombre: 'Oficina Cryptoville', barrio: 'academy', lote: 2, categoria: 'mentorias', color: '#3d85c6', descripcion: 'Ayuda para empezar en el pueblo',
      apariencia: {
        techo: 'buhardilla', colorTecho: 'pizarra', pared: 'piedra', colorPared: 'marfil', puerta: 'doble', ventana: 'dos', toldo: 'rayas',
        letrero: 'placa', frente: 'plantas', piso: 'alfombra', paredInterior: 'verde', muebles: 'biblioteca', decoracion: 'diplomas',
      },
    },
  },
  ana: {
    bio: 'Diseñadora gráfica. Logos, identidad de marca e ilustración.',
    avatar: 99,
    apariencia: {
      piel: 'piel-2', peinado: 'melena', colorPelo: 'castano-oscuro', barba: 'ninguna', arriba: 'delantal', colorArriba: 'mostaza',
      abajo: 'pantalon', colorAbajo: 'marino', zapatos: 'zapatillas-blancas', lentes: 'ninguno', gorro: 'boina', colorGorro: 'coral', objeto: 'pincel',
    },
    local: {
      nombre: 'Estudio Ana', barrio: 'creativo', lote: 1, categoria: 'diseno-grafico', color: '#e07a5f', descripcion: 'Diseño de marca para emprendedores',
      apariencia: {
        techo: 'tejas', colorTecho: 'coral', pared: 'liso', colorPared: 'vainilla', puerta: 'arco', ventana: 'vitrina', toldo: 'ondas',
        letrero: 'pintado', frente: 'caballete', piso: 'madera', paredInterior: 'vainilla', muebles: 'atril', decoracion: 'cuadros',
      },
    },
  },
  luis: {
    bio: 'Editor de video para redes y YouTube.',
    avatar: 98,
    apariencia: {
      piel: 'piel-4', peinado: 'corto', colorPelo: 'negro', barba: 'corta', arriba: 'sudadera', colorArriba: 'carbon',
      abajo: 'pantalon', colorAbajo: 'marino', zapatos: 'zapatillas-azules', lentes: 'cuadrados', gorro: 'gorra', colorGorro: 'vino', objeto: 'camara',
    },
    local: {
      nombre: 'Luis Edita', barrio: 'audiovisual', lote: 1, categoria: 'edicion-video', color: '#9b7bc4', descripcion: 'Videos cortos que se ven bien',
      apariencia: {
        techo: 'equipos', colorTecho: 'grafito', pared: 'liso', colorPared: 'crema', puerta: 'simple', ventana: 'vitrina', toldo: 'rayas',
        letrero: 'marquesina', frente: 'reflector', piso: 'alfombra', paredInterior: 'grafito', muebles: 'sala-edicion', decoracion: 'afiches',
      },
    },
  },
  sofia: {
    bio: 'Profesora de inglés y guitarra, clases por videollamada.',
    avatar: 88,
    apariencia: {
      piel: 'piel-2', peinado: 'largo', colorPelo: 'cobrizo', barba: 'ninguna', arriba: 'vestido', colorArriba: 'lavanda',
      abajo: 'falda', colorAbajo: 'lavanda', zapatos: 'botas-cafe', lentes: 'ninguno', gorro: 'ninguno', colorGorro: 'gris', objeto: 'libro',
    },
    local: {
      nombre: 'Aula Sofía', barrio: 'academy', lote: 1, categoria: 'idiomas', color: '#81b29a', descripcion: 'Clases en línea a tu ritmo',
      apariencia: {
        techo: 'tejas', colorTecho: 'teja', pared: 'ladrillo', colorPared: 'ladrillo', puerta: 'arco', ventana: 'arco', toldo: 'liso',
        letrero: 'clasico', frente: 'pizarra', piso: 'parquet', paredInterior: 'marfil', muebles: 'aula', decoracion: 'mapa',
      },
    },
  },
  diego: {
    bio: 'Desarrollador web. Sitios, tiendas y soporte técnico.',
    avatar: 112,
    apariencia: {
      piel: 'piel-5', peinado: 'rizado', colorPelo: 'negro', barba: 'candado', arriba: 'polera-codigo', colorArriba: 'azul',
      abajo: 'pantalon', colorAbajo: 'carbon', zapatos: 'zapatillas-blancas', lentes: 'ninguno', gorro: 'ninguno', colorGorro: 'gris', objeto: 'laptop',
    },
    local: {
      nombre: 'Diego Dev', barrio: 'tech', lote: 1, categoria: 'desarrollo-web', color: '#f2cc8f', descripcion: 'Tu web lista en días',
      apariencia: {
        techo: 'solar', colorTecho: 'acero', pared: 'vidrio', colorPared: 'nube', puerta: 'vidrio', ventana: 'vitrina', toldo: 'ninguno',
        letrero: 'neon', frente: 'robot', piso: 'cemento', paredInterior: 'grafito', muebles: 'escritorio', decoracion: 'pantallas',
      },
    },
  },
};

// Si alguien edita los perfiles con una pieza que no existe, el seed se detiene antes de tocar la base.
for (const [clave, perfil] of Object.entries(PERFILES)) {
  const persona = validarAparienciaPersona(perfil.apariencia);
  if (!persona.ok) throw new Error(`Perfil de ejemplo "${clave}": ${persona.error}`);
  const casa = validarAparienciaCasa(perfil.local.barrio, perfil.local.apariencia);
  if (!casa.ok) throw new Error(`Casa de ejemplo "${clave}": ${casa.error}`);
}

const SERVICIOS: Record<string, { titulo: string; descripcion: string; precio_usdc: string; dias_entrega: number }[]> = {
  arbitro: [
    { titulo: 'Asesoría: tu primer pago en Stellar Lab', descripcion: 'Te acompaño por videollamada a crear tu wallet de testnet, recibir USDC de prueba y hacer tu primer pago en garantía.', precio_usdc: '1', dias_entrega: 2 },
  ],
  ana: [
    { titulo: 'Logo para tu emprendimiento', descripcion: 'Tres propuestas de logo, dos rondas de cambios y archivos finales en PNG y SVG.', precio_usdc: '40', dias_entrega: 5 },
    { titulo: 'Ilustración para redes', descripcion: 'Una ilustración a color para tu perfil o publicación, en el formato que necesites.', precio_usdc: '25', dias_entrega: 4 },
    { titulo: 'Tarjeta de presentación', descripcion: 'Diseño de tarjeta a dos caras, lista para imprimir.', precio_usdc: '15', dias_entrega: 3 },
  ],
  luis: [
    { titulo: 'Edición de video corto (60 s)', descripcion: 'Edito tu video para Reels, TikTok o Shorts con subtítulos y música libre.', precio_usdc: '20', dias_entrega: 3 },
    { titulo: 'Intro animada para YouTube', descripcion: 'Intro de 5 a 8 segundos con tu logo y nombre del canal.', precio_usdc: '30', dias_entrega: 5 },
  ],
  sofia: [
    { titulo: 'Clase de inglés (1 hora)', descripcion: 'Clase personalizada por videollamada: conversación, gramática o preparación de examen.', precio_usdc: '12', dias_entrega: 7 },
    { titulo: 'Clase de guitarra para principiantes', descripcion: 'Primeros acordes y ritmos, con material para practicar en casa.', precio_usdc: '10', dias_entrega: 7 },
  ],
  diego: [
    { titulo: 'Página web de una sección', descripcion: 'Landing page responsiva con tu información, formulario de contacto y publicación incluida.', precio_usdc: '80', dias_entrega: 10 },
    { titulo: 'Soporte técnico remoto (1 hora)', descripcion: 'Resuelvo problemas de tu computadora o configuraciones por escritorio remoto.', precio_usdc: '15', dias_entrega: 2 },
    { titulo: 'Revisión de seguridad de tu sitio', descripcion: 'Reviso tu sitio y te entrego un informe con los problemas encontrados y cómo arreglarlos.', precio_usdc: '50', dias_entrega: 7 },
  ],
};

const DIA = 86_400_000;
let contadorNumero = 0;
function numeroEjemplo(): bigint {
  // Números de pedido de ejemplo: 9xxx… (no chocan con los reales, que empiezan con la fecha).
  contadorNumero += 1;
  return 9_000_000_000_000n + BigInt(contadorNumero);
}
function numeroReal(): bigint {
  contadorNumero += 1;
  return BigInt(Math.floor(Date.now() / 1000)) * 1000n + BigInt(contadorNumero);
}

const esperar = (ms: number) => new Promise((listo) => setTimeout(listo, ms));

async function asegurarCuentaAuth(direccion: string): Promise<string> {
  const email = correoDeWallet(direccion, DOMINIO);
  const password = contrasenaDeWallet(direccion, SECRETO);
  // Reintenta si Auth todavía está arrancando (errores de red o 5xx).
  let creado = await supabase.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { direccion } });
  for (let intento = 1; intento < 6 && creado.error && (creado.error.status === undefined || creado.error.status >= 500); intento++) {
    console.log(`  Auth todavía no está lista (${creado.error.message}); reintento ${intento}/5…`);
    await esperar(3000);
    creado = await supabase.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { direccion } });
  }
  if (creado.data.user) return creado.data.user.id;
  // Ya existía: se busca por correo.
  for (let pagina = 1; pagina < 50; pagina++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page: pagina, perPage: 200 });
    if (error) throw error;
    const u = (data.users as { id: string; email?: string }[]).find((x) => x.email === email);
    if (u) {
      await supabase.auth.admin.updateUserById(u.id, { password });
      return u.id;
    }
    if (data.users.length < 200) break;
  }
  throw new Error(`No se pudo crear la cuenta de ${direccion}: ${creado.error?.message} (estado ${creado.error?.status})`);
}

async function main() {
  const archivo = path.join(raiz, '.seed-keys.json');
  if (!existsSync(archivo)) throw new Error('No existe .seed-keys.json: ejecuta primero `npm run seed:keys`');
  const llaves = JSON.parse(readFileSync(archivo, 'utf8')) as { usuarios: LlaveEjemplo[] };
  const direcciones = llaves.usuarios.map((u) => u.publica);

  const ajenos = await prisma.usuario.count({ where: { direccion: { notIn: direcciones } } });
  if (ajenos > 0 && !forzar) {
    console.error(`La base tiene ${ajenos} usuarios reales. No se cargan datos de ejemplo para no mezclar ni borrar nada.`);
    console.error('Si de verdad quieres borrar TODO y cargar el ejemplo: npm run db:seed -- --forzar');
    process.exit(1);
  }

  console.log('Borrando datos anteriores…');
  await prisma.$transaction([
    prisma.aviso.deleteMany(),
    prisma.propuesta.deleteMany(),
    prisma.busqueda.deleteMany(),
    prisma.resena.deleteMany(),
    prisma.disputa.deleteMany(),
    prisma.mensaje.deleteMany(),
    prisma.pasoPedido.deleteMany(),
    prisma.pedido.deleteMany(),
    prisma.servicio.deleteMany(),
    prisma.local.deleteMany(),
    prisma.desafioLogin.deleteMany(),
    prisma.usuario.deleteMany(),
  ]);

  console.log('Creando usuarios, locales y servicios…');
  const ids: Record<string, string> = {};
  const servicios: Record<string, { id: string; titulo: string; precio_usdc: string }[]> = {};
  for (const u of llaves.usuarios) {
    const perfil = PERFILES[u.clave];
    const id = await asegurarCuentaAuth(u.publica);
    ids[u.clave] = id;
    await prisma.usuario.create({
      data: { id, direccion: u.publica, nombre: u.nombre, rol: u.rol, bio: perfil.bio, avatar: perfil.avatar, apariencia: { ...perfil.apariencia } },
    });
    const local = await prisma.local.create({
      data: { usuario_id: id, ...perfil.local, apariencia: { ...perfil.local.apariencia } },
    });
    servicios[u.clave] = [];
    for (const s of SERVICIOS[u.clave]) {
      const creado = await prisma.servicio.create({ data: { local_id: local.id, ...s } });
      servicios[u.clave].push({ id: creado.id, titulo: s.titulo, precio_usdc: s.precio_usdc });
    }
  }

  console.log('Creando pedidos de ejemplo…');
  const ahora = Date.now();
  async function pedido(p: {
    cliente: string;
    proveedor: string;
    servicio: number;
    estado: EstadoPedido;
    detalle: string;
    ejemplo: boolean;
    hace_dias: number;
    pasos: AccionPedido[];
    mensajes?: [string, string][];
  }) {
    const s = servicios[p.proveedor][p.servicio];
    const creado = new Date(ahora - p.hace_dias * DIA - 3 * 3_600_000);
    const conFecha = p.estado !== 'solicitado';
    const fila = await prisma.pedido.create({
      data: {
        numero: p.ejemplo ? numeroEjemplo() : numeroReal(),
        servicio_id: s.id,
        cliente_id: ids[p.cliente],
        proveedor_id: ids[p.proveedor],
        estado: p.estado,
        monto_usdc: s.precio_usdc,
        detalle: p.detalle,
        es_ejemplo: p.ejemplo,
        fecha_limite: conFecha ? new Date(p.ejemplo ? creado.getTime() + 7 * DIA : ahora + 7 * DIA) : null,
        creado_en: creado,
      },
    });
    // Los pasos se reparten entre la creación del pedido y ahora (nunca en el futuro).
    const intervalo = Math.min(DIA / 2, (ahora - creado.getTime() - 60_000) / (p.pasos.length + 1));
    let t = creado.getTime();
    for (const accion of p.pasos) {
      t += Math.max(60_000, intervalo);
      const declara = ['aceptar', 'marcar_entregado', 'rechazar'].includes(accion) ? p.proveedor : accion === 'resolver' ? 'arbitro' : p.cliente;
      await prisma.pasoPedido.create({
        data: { pedido_id: fila.id, accion, declarado_por: ids[declara], hash: null, creado_en: new Date(t) },
      });
    }
    for (const [autor, texto] of p.mensajes ?? []) {
      t = Math.min(t + 3_600_000, ahora - 30_000);
      await prisma.mensaje.create({ data: { pedido_id: fila.id, autor_id: ids[autor], texto, creado_en: new Date(t) } });
    }
    return fila;
  }

  // 1. Pago liberado, con reseñas de las dos partes.
  const p1 = await pedido({
    cliente: 'sofia', proveedor: 'ana', servicio: 0, estado: 'liberado', ejemplo: true, hace_dias: 12,
    detalle: 'Necesito un logo para mi academia en línea "Aula Sofía", con tonos verdes.',
    pasos: ['aceptar', 'crear_pedido', 'marcar_entregado', 'liberar'],
    mensajes: [
      ['sofia', '¡Hola Ana! Me gustaría algo sencillo y amigable.'],
      ['ana', 'Perfecto, te mando tres propuestas mañana.'],
      ['sofia', '¡Me encantó la segunda! Libero el pago.'],
    ],
  });
  await prisma.resena.createMany({
    data: [
      { pedido_id: p1.id, autor_id: ids.sofia, destinatario_id: ids.ana, calificacion: 5, comentario: 'Rapidísima y muy creativa. ¡Recomendada!' },
      { pedido_id: p1.id, autor_id: ids.ana, destinatario_id: ids.sofia, calificacion: 5, comentario: 'Clienta clara con lo que quería y pago al instante.' },
    ],
  });

  // 2. Disputa resuelta a favor del proveedor.
  const p2 = await pedido({
    cliente: 'diego', proveedor: 'luis', servicio: 0, estado: 'resuelto', ejemplo: true, hace_dias: 9,
    detalle: 'Editar un video de 60 segundos para presentar mi servicio web.',
    pasos: ['aceptar', 'crear_pedido', 'marcar_entregado', 'abrir_disputa', 'resolver'],
    mensajes: [
      ['diego', 'El video no tiene subtítulos como acordamos.'],
      ['luis', 'Los subtítulos están en un archivo aparte, te lo reenvié.'],
      ['arbitro', 'Revisamos el chat y la entrega: el video y los subtítulos cumplen lo acordado.'],
    ],
  });
  await prisma.disputa.create({
    data: {
      pedido_id: p2.id, abierta_por: ids.diego, motivo: 'El video no traía subtítulos incrustados.',
      ganador: 'Proveedor', decision: 'La entrega incluía los subtítulos en un archivo aparte, como se acordó en el chat.',
      creado_en: new Date(ahora - 7 * DIA), resuelta_en: new Date(ahora - 6 * DIA),
    },
  });
  await prisma.resena.create({
    data: { pedido_id: p2.id, autor_id: ids.luis, destinatario_id: ids.diego, calificacion: 4, comentario: 'Al final todo bien, buena comunicación.' },
  });

  // 3. El proveedor devolvió el dinero.
  await pedido({
    cliente: 'ana', proveedor: 'diego', servicio: 0, estado: 'reembolsado', ejemplo: true, hace_dias: 6,
    detalle: 'Una página para mostrar mi portafolio de diseño.',
    pasos: ['aceptar', 'crear_pedido', 'rechazar'],
    mensajes: [['diego', 'Lo siento Ana, esta semana no voy a poder; te devolví el dinero.']],
  });

  // 4. Solicitado (real: Sofía puede aceptarlo).
  await pedido({
    cliente: 'luis', proveedor: 'sofia', servicio: 0, estado: 'solicitado', ejemplo: false, hace_dias: 0,
    detalle: 'Quiero practicar conversación en inglés para una entrevista de trabajo.',
    pasos: [],
    mensajes: [['luis', '¡Hola! ¿Tienes horario el jueves por la tarde?']],
  });

  // 5. Aceptado (real: Ana puede pagarlo en garantía desde Stellar Lab).
  await pedido({
    cliente: 'ana', proveedor: 'sofia', servicio: 1, estado: 'aceptado', ejemplo: false, hace_dias: 0,
    detalle: 'Clase de guitarra para empezar desde cero.',
    pasos: ['aceptar'],
  });

  await prisma.aviso.createMany({
    data: [
      { usuario_id: ids.sofia, tipo: 'nuevo_pedido', texto: 'Luis Méndez quiere contratar «Clase de inglés (1 hora)». Revisa el pedido y acéptalo.' },
      { usuario_id: ids.ana, tipo: 'te_toca_pagar', texto: 'Sofía Paredes aceptó tu pedido. Paga en garantía desde Stellar Lab para que empiece.' },
    ],
  });

  console.log('Creando «Se busca» y propuestas…');
  const enDias = (d: number) => new Date(ahora + d * DIA);
  const lotesSeBusca: Partial<Record<Barrio, number>> = {};
  async function seBusca(b: {
    autor: string;
    titulo: string;
    descripcion: string;
    barrio: Barrio;
    categoria: string;
    presupuesto: string;
    dias: number;
    propuestas?: { proveedor: string; monto: string; dias: number; mensaje: string }[];
  }) {
    const fila = await prisma.busqueda.create({
      data: {
        autor_id: ids[b.autor],
        titulo: b.titulo,
        descripcion: b.descripcion,
        barrio: b.barrio,
        categoria: b.categoria,
        // Casas del modo «Quiero trabajar»: lotes seguidos dentro de cada villa.
        lote: (lotesSeBusca[b.barrio] = (lotesSeBusca[b.barrio] ?? 0) + 1),
        presupuesto_usdc: b.presupuesto,
        fecha_limite: enDias(b.dias),
        total_propuestas: b.propuestas?.length ?? 0,
        creado_en: new Date(ahora - 2 * 3_600_000),
      },
    });
    for (const p of b.propuestas ?? []) {
      await prisma.propuesta.create({
        data: { busqueda_id: fila.id, proveedor_id: ids[p.proveedor], monto_usdc: p.monto, dias_entrega: p.dias, mensaje: p.mensaje },
      });
      await prisma.aviso.create({
        data: {
          usuario_id: ids[b.autor],
          busqueda_id: fila.id,
          tipo: 'nueva_propuesta',
          texto: `Te llegó una propuesta para «${b.titulo}» por ${p.monto} USDC.`,
        },
      });
    }
  }
  await seBusca({
    autor: 'diego', titulo: 'Logo para mi tienda de computadoras', barrio: 'creativo', categoria: 'diseno-grafico', presupuesto: '35', dias: 10,
    descripcion: 'Busco un logo moderno y sencillo para una tienda en línea de computadoras y accesorios.',
    propuestas: [{ proveedor: 'ana', monto: '35', dias: 5, mensaje: 'Te propongo tres bocetos, dos rondas de cambios y los archivos en PNG y SVG.' }],
  });
  await seBusca({
    autor: 'sofia', titulo: 'Video corto para promocionar mis clases', barrio: 'audiovisual', categoria: 'edicion-video', presupuesto: '30', dias: 14,
    descripcion: 'Necesito un video de 30 segundos para redes que muestre cómo son mis clases de inglés en línea.',
    propuestas: [{ proveedor: 'luis', monto: '28', dias: 6, mensaje: 'Lo edito con subtítulos y música libre; te paso una primera versión en 3 días.' }],
  });
  await seBusca({
    autor: 'luis', titulo: 'Página para mi portafolio de videos', barrio: 'tech', categoria: 'desarrollo-web', presupuesto: '70', dias: 20,
    descripcion: 'Quiero una página de una sección para mostrar mis trabajos de edición, con formulario de contacto.',
  });
  await seBusca({
    autor: 'ana', titulo: 'Clases de inglés para presentar a clientes', barrio: 'academy', categoria: 'idiomas', presupuesto: '20', dias: 12,
    descripcion: 'Busco dos clases de conversación en inglés para practicar presentaciones de proyectos de diseño.',
  });

  console.log('✔ Datos de ejemplo cargados:');
  for (const u of llaves.usuarios) {
    const l = PERFILES[u.clave].local;
    console.log(`  ${u.nombre.padEnd(20)} ${u.rol === 'arbitro' ? '(árbitro) ' : ''}${u.publica}  · Villa ${l.barrio}, lote ${l.lote}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
