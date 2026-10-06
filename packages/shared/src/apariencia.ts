// Catálogo de apariencias: personas (personajes) y casas (locales).
//
// - La web dibuja con estas piezas (apps/web/src/arte) y la API valida contra este mismo catálogo.
// - Todo se elige de listas cerradas: no hay colores libres.
// - Se guardan los ids de las piezas (jsonb `apariencia` en `usuarios` y en `locales`).
import type { Barrio } from './types/index.js';

export interface OpcionPieza {
  id: string;
  nombre: string;
  /** Color de la pieza, si la pieza es un color o tiene un color fijo. */
  color?: string;
}

// ---------------------------------------------------------------
// Personas
// ---------------------------------------------------------------

export const PIELES: readonly OpcionPieza[] = [
  { id: 'piel-1', nombre: 'Muy clara', color: '#f9dcc4' },
  { id: 'piel-2', nombre: 'Clara', color: '#f4bd8a' },
  { id: 'piel-3', nombre: 'Media', color: '#e0a06e' },
  { id: 'piel-4', nombre: 'Trigueña', color: '#c68352' },
  { id: 'piel-5', nombre: 'Morena', color: '#9a6037' },
  { id: 'piel-6', nombre: 'Oscura', color: '#6b4127' },
];

export const PEINADOS: readonly OpcionPieza[] = [
  { id: 'corto', nombre: 'Corto' },
  { id: 'lateral', nombre: 'Con raya al lado' },
  { id: 'largo', nombre: 'Largo' },
  { id: 'melena', nombre: 'Melena' },
  { id: 'recogido', nombre: 'Recogido' },
  { id: 'rizado', nombre: 'Rizado' },
  { id: 'rapado', nombre: 'Rapado' },
  { id: 'calvo', nombre: 'Calvo' },
];

export const COLORES_PELO: readonly OpcionPieza[] = [
  { id: 'negro', nombre: 'Negro', color: '#2f2523' },
  { id: 'castano-oscuro', nombre: 'Castaño oscuro', color: '#5a3a2a' },
  { id: 'castano', nombre: 'Castaño', color: '#8a5a3c' },
  { id: 'cobrizo', nombre: 'Cobrizo', color: '#b5653f' },
  { id: 'rubio', nombre: 'Rubio', color: '#d9b26a' },
  { id: 'gris', nombre: 'Gris', color: '#a9a29b' },
  { id: 'blanco', nombre: 'Blanco', color: '#e6e0d6' },
];

export const BARBAS: readonly OpcionPieza[] = [
  { id: 'ninguna', nombre: 'Sin barba' },
  { id: 'bigote', nombre: 'Bigote' },
  { id: 'candado', nombre: 'Candado' },
  { id: 'corta', nombre: 'Barba corta' },
  { id: 'completa', nombre: 'Barba completa' },
];

/** Colores de ropa y gorros (tonos suaves que combinan con el pueblo). */
export const COLORES_ROPA: readonly OpcionPieza[] = [
  { id: 'coral', nombre: 'Coral', color: '#e07a5f' },
  { id: 'vino', nombre: 'Vino', color: '#a95656' },
  { id: 'mostaza', nombre: 'Mostaza', color: '#e9b44c' },
  { id: 'salvia', nombre: 'Salvia', color: '#81b29a' },
  { id: 'verde', nombre: 'Verde', color: '#5d9b78' },
  { id: 'cielo', nombre: 'Cielo', color: '#8aa0c8' },
  { id: 'azul', nombre: 'Azul', color: '#3d85c6' },
  { id: 'marino', nombre: 'Marino', color: '#46557a' },
  { id: 'lavanda', nombre: 'Lavanda', color: '#a46ab8' },
  { id: 'gris', nombre: 'Gris', color: '#aab3c0' },
  { id: 'carbon', nombre: 'Carbón', color: '#4b4048' },
  { id: 'crema', nombre: 'Crema', color: '#ecdcc6' },
  { id: 'cafe', nombre: 'Café', color: '#8a5a44' },
  { id: 'blanco', nombre: 'Blanco', color: '#f4efe6' },
];

export const ROPA_ARRIBA: readonly OpcionPieza[] = [
  { id: 'polera', nombre: 'Polera' },
  { id: 'polera-codigo', nombre: 'Polera con </>' },
  { id: 'camisa', nombre: 'Camisa' },
  { id: 'sueter', nombre: 'Suéter' },
  { id: 'sudadera', nombre: 'Sudadera' },
  { id: 'chaqueta', nombre: 'Chaqueta' },
  { id: 'vestido', nombre: 'Vestido' },
  { id: 'delantal', nombre: 'Delantal de artista' },
];

export const ROPA_ABAJO: readonly OpcionPieza[] = [
  { id: 'pantalon', nombre: 'Pantalón' },
  { id: 'falda', nombre: 'Falda' },
  { id: 'short', nombre: 'Short' },
];

export const ZAPATOS: readonly OpcionPieza[] = [
  { id: 'botas-cafe', nombre: 'Botas café', color: '#7a4a33' },
  { id: 'botas-negras', nombre: 'Botas negras', color: '#3a3033' },
  { id: 'zapatillas-blancas', nombre: 'Zapatillas blancas', color: '#f4efe6' },
  { id: 'zapatillas-azules', nombre: 'Zapatillas azules', color: '#3d85c6' },
  { id: 'zapatos-cafe', nombre: 'Zapatos café', color: '#8a5a44' },
  { id: 'zapatos-negros', nombre: 'Zapatos negros', color: '#2f2523' },
];

export const LENTES: readonly OpcionPieza[] = [
  { id: 'ninguno', nombre: 'Sin lentes' },
  { id: 'redondos', nombre: 'Redondos' },
  { id: 'cuadrados', nombre: 'Cuadrados' },
  { id: 'sol', nombre: 'De sol' },
  { id: 'lectura', nombre: 'De lectura' },
];

export const GORROS: readonly OpcionPieza[] = [
  { id: 'ninguno', nombre: 'Sin gorro' },
  { id: 'lana', nombre: 'Gorro de lana' },
  { id: 'gorra', nombre: 'Gorra' },
  { id: 'boina', nombre: 'Boina' },
  { id: 'sombrero', nombre: 'Sombrero' },
  { id: 'vincha', nombre: 'Vincha' },
];

export const OBJETOS: readonly OpcionPieza[] = [
  { id: 'ninguno', nombre: 'Nada' },
  { id: 'camara', nombre: 'Cámara' },
  { id: 'laptop', nombre: 'Laptop' },
  { id: 'pincel', nombre: 'Pincel' },
  { id: 'libro', nombre: 'Libro' },
  { id: 'taza', nombre: 'Taza' },
  { id: 'microfono', nombre: 'Micrófono' },
  { id: 'tableta', nombre: 'Tableta gráfica' },
];

/** Partes de una persona. Todas se mezclan libremente (no se elige "hombre" ni "mujer"). */
export interface AparienciaPersona {
  piel: string;
  peinado: string;
  colorPelo: string;
  barba: string;
  arriba: string;
  colorArriba: string;
  abajo: string;
  colorAbajo: string;
  zapatos: string;
  lentes: string;
  gorro: string;
  colorGorro: string;
  objeto: string;
}

export type CampoPersona = keyof AparienciaPersona;

export const CATALOGO_PERSONA: Record<CampoPersona, readonly OpcionPieza[]> = {
  piel: PIELES,
  peinado: PEINADOS,
  colorPelo: COLORES_PELO,
  barba: BARBAS,
  arriba: ROPA_ARRIBA,
  colorArriba: COLORES_ROPA,
  abajo: ROPA_ABAJO,
  colorAbajo: COLORES_ROPA,
  zapatos: ZAPATOS,
  lentes: LENTES,
  gorro: GORROS,
  colorGorro: COLORES_ROPA,
  objeto: OBJETOS,
};

/** Nombres de las partes para el editor del perfil, en orden. */
export const CAMPOS_PERSONA: readonly { campo: CampoPersona; nombre: string }[] = [
  { campo: 'piel', nombre: 'Tono de piel' },
  { campo: 'peinado', nombre: 'Peinado' },
  { campo: 'colorPelo', nombre: 'Color de pelo' },
  { campo: 'barba', nombre: 'Barba o bigote' },
  { campo: 'arriba', nombre: 'Ropa de arriba' },
  { campo: 'colorArriba', nombre: 'Color de arriba' },
  { campo: 'abajo', nombre: 'Ropa de abajo' },
  { campo: 'colorAbajo', nombre: 'Color de abajo' },
  { campo: 'zapatos', nombre: 'Zapatos' },
  { campo: 'lentes', nombre: 'Lentes' },
  { campo: 'gorro', nombre: 'Gorro' },
  { campo: 'colorGorro', nombre: 'Color del gorro' },
  { campo: 'objeto', nombre: 'En la mano' },
];

const persona = (p: Partial<AparienciaPersona>): AparienciaPersona => ({
  piel: 'piel-2',
  peinado: 'corto',
  colorPelo: 'castano',
  barba: 'ninguna',
  arriba: 'polera',
  colorArriba: 'gris',
  abajo: 'pantalon',
  colorAbajo: 'cafe',
  zapatos: 'botas-cafe',
  lentes: 'ninguno',
  gorro: 'ninguno',
  colorGorro: 'gris',
  objeto: 'ninguno',
  ...p,
});

/**
 * Conversión de los 12 personajes de Kenney (columna `avatar`) a personas parecidas:
 * mismo pelo, ropa y estilo. Los cascos y el sombrero de mago pasan a gorros de la lista.
 */
export const APARIENCIA_POR_AVATAR: Record<number, AparienciaPersona> = {
  // Mago: sombrero y túnica morados, barba blanca.
  84: persona({ peinado: 'largo', colorPelo: 'blanco', barba: 'completa', arriba: 'sueter', colorArriba: 'lavanda', colorAbajo: 'lavanda', gorro: 'lana', colorGorro: 'lavanda', objeto: 'libro' }),
  // Pelo castaño y polera gris.
  85: persona({}),
  // Calvo con bigote y delantal café.
  86: persona({ peinado: 'calvo', colorPelo: 'castano-oscuro', barba: 'bigote', arriba: 'delantal', colorArriba: 'gris', colorAbajo: 'cafe', zapatos: 'zapatos-cafe' }),
  // Vikingo: casco gris y barba cobriza.
  87: persona({ peinado: 'corto', colorPelo: 'cobrizo', barba: 'completa', arriba: 'sueter', colorArriba: 'gris', colorAbajo: 'cafe', gorro: 'lana', colorGorro: 'gris' }),
  // Pelo castaño y ropa clara.
  88: persona({ piel: 'piel-3', peinado: 'lateral', colorPelo: 'castano', arriba: 'polera', colorArriba: 'crema', colorAbajo: 'cafe' }),
  // Caballero con casco cerrado.
  96: persona({ peinado: 'rapado', colorPelo: 'castano-oscuro', arriba: 'chaqueta', colorArriba: 'gris', colorAbajo: 'marino', zapatos: 'botas-negras', gorro: 'lana', colorGorro: 'gris' }),
  // Caballero con visera.
  97: persona({ peinado: 'corto', colorPelo: 'negro', arriba: 'chaqueta', colorArriba: 'gris', colorAbajo: 'marino', zapatos: 'botas-negras', gorro: 'gorra', colorGorro: 'gris' }),
  // Pelo castaño y armadura gris.
  98: persona({ peinado: 'corto', colorPelo: 'castano', arriba: 'chaqueta', colorArriba: 'gris', colorAbajo: 'marino', zapatos: 'botas-negras' }),
  // Pelo largo y vestido morado (como la vecina de la muestra).
  99: persona({ peinado: 'largo', colorPelo: 'cobrizo', arriba: 'vestido', colorArriba: 'lavanda', abajo: 'falda', colorAbajo: 'lavanda' }),
  // Pelo largo canoso y túnica café.
  100: persona({ peinado: 'largo', colorPelo: 'gris', arriba: 'sudadera', colorArriba: 'cafe', colorAbajo: 'cafe' }),
  // Encapuchado con barba gris.
  111: persona({ peinado: 'rapado', colorPelo: 'gris', barba: 'completa', arriba: 'sudadera', colorArriba: 'cafe', colorAbajo: 'cafe' }),
  // Vincha verde, pelo y barba castaños, ropa verde.
  112: persona({ peinado: 'corto', colorPelo: 'castano', barba: 'completa', arriba: 'polera', colorArriba: 'verde', colorAbajo: 'cafe', gorro: 'vincha', colorGorro: 'verde' }),
};

/** Persona equivalente a un personaje de Kenney (o la de 85 si el número no existe). */
export function aparienciaDeAvatar(avatar: number): AparienciaPersona {
  return { ...(APARIENCIA_POR_AVATAR[avatar] ?? APARIENCIA_POR_AVATAR[85]) };
}

export type ResultadoValidacion<T> = { ok: true; valor: T } | { ok: false; error: string };

function validarContra<T extends object>(
  catalogo: Record<string, readonly OpcionPieza[]>,
  nombres: Record<string, string>,
  valor: unknown,
  que: string,
): ResultadoValidacion<T> {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    return { ok: false, error: `La apariencia ${que} debe ser un objeto` };
  }
  const obj = valor as Record<string, unknown>;
  for (const campo of Object.keys(obj)) {
    if (!(campo in catalogo)) return { ok: false, error: `La apariencia ${que} tiene un campo desconocido: «${campo}»` };
  }
  const limpio: Record<string, string> = {};
  for (const [campo, opciones] of Object.entries(catalogo)) {
    const v = obj[campo];
    if (v === undefined) return { ok: false, error: `Falta «${nombres[campo] ?? campo}» en la apariencia ${que}` };
    if (typeof v !== 'string' || !opciones.some((o) => o.id === v)) {
      return { ok: false, error: `«${String(v)}» no es una opción válida de ${(nombres[campo] ?? campo).toLowerCase()}` };
    }
    limpio[campo] = v;
  }
  return { ok: true, valor: limpio as T };
}

function normalizarContra<T extends object>(catalogo: Record<string, readonly OpcionPieza[]>, valor: unknown, base: T): T {
  const obj = typeof valor === 'object' && valor !== null ? (valor as Record<string, unknown>) : {};
  const limpio: Record<string, string> = {};
  for (const [campo, opciones] of Object.entries(catalogo)) {
    const v = obj[campo];
    limpio[campo] = typeof v === 'string' && opciones.some((o) => o.id === v) ? v : (base as Record<string, string>)[campo];
  }
  return limpio as T;
}

const NOMBRES_PERSONA = Object.fromEntries(CAMPOS_PERSONA.map((c) => [c.campo, c.nombre]));

/** Valida una apariencia completa contra el catálogo (la usa la API en PATCH /yo). */
export function validarAparienciaPersona(valor: unknown): ResultadoValidacion<AparienciaPersona> {
  return validarContra<AparienciaPersona>(CATALOGO_PERSONA, NOMBRES_PERSONA, valor, 'del personaje');
}

/** Deja una apariencia lista para dibujar: lo que no sea válido se toma de `base`. */
export function normalizarAparienciaPersona(valor: unknown, base: AparienciaPersona = APARIENCIA_POR_AVATAR[85]): AparienciaPersona {
  return normalizarContra(CATALOGO_PERSONA, valor, base);
}

/** La persona que se dibuja para un usuario: su `apariencia`, o la equivalente a su `avatar`. */
export function aparienciaDeUsuario(u: { avatar: number; apariencia?: unknown }): AparienciaPersona {
  const base = aparienciaDeAvatar(u.avatar);
  return u.apariencia ? normalizarAparienciaPersona(u.apariencia, base) : base;
}

export function colorDe(opciones: readonly OpcionPieza[], id: string, porDefecto = '#cccccc'): string {
  return opciones.find((o) => o.id === id)?.color ?? porDefecto;
}

// ---------------------------------------------------------------
// Casas
// ---------------------------------------------------------------

/** Piezas de una casa: exterior e interior. Los colores son de la paleta cerrada de su villa. */
export interface AparienciaCasa {
  techo: string;
  colorTecho: string;
  pared: string;
  colorPared: string;
  puerta: string;
  ventana: string;
  toldo: string;
  letrero: string;
  frente: string;
  piso: string;
  paredInterior: string;
  muebles: string;
  decoracion: string;
}

export type CampoCasa = keyof AparienciaCasa;
export type CatalogoCasa = Record<CampoCasa, readonly OpcionPieza[]>;

export const CAMPOS_CASA: readonly { campo: CampoCasa; nombre: string; parte: 'exterior' | 'interior' }[] = [
  { campo: 'techo', nombre: 'Techo', parte: 'exterior' },
  { campo: 'colorTecho', nombre: 'Color del techo', parte: 'exterior' },
  { campo: 'pared', nombre: 'Paredes', parte: 'exterior' },
  { campo: 'colorPared', nombre: 'Color de las paredes', parte: 'exterior' },
  { campo: 'puerta', nombre: 'Puerta', parte: 'exterior' },
  { campo: 'ventana', nombre: 'Ventanas', parte: 'exterior' },
  { campo: 'toldo', nombre: 'Toldo', parte: 'exterior' },
  { campo: 'letrero', nombre: 'Letrero', parte: 'exterior' },
  { campo: 'frente', nombre: 'Decoración del frente', parte: 'exterior' },
  { campo: 'piso', nombre: 'Piso', parte: 'interior' },
  { campo: 'paredInterior', nombre: 'Color de las paredes', parte: 'interior' },
  { campo: 'muebles', nombre: 'Muebles', parte: 'interior' },
  { campo: 'decoracion', nombre: 'Decoración', parte: 'interior' },
];

const PUERTAS: readonly OpcionPieza[] = [
  { id: 'simple', nombre: 'Sencilla' },
  { id: 'vidrio', nombre: 'Con vidrio' },
  { id: 'doble', nombre: 'Doble' },
  { id: 'arco', nombre: 'De arco' },
];
const VENTANAS: readonly OpcionPieza[] = [
  { id: 'vitrina', nombre: 'Vitrina' },
  { id: 'dos', nombre: 'Dos ventanas' },
  { id: 'redonda', nombre: 'Redonda' },
  { id: 'arco', nombre: 'De arco' },
];
const TOLDOS: readonly OpcionPieza[] = [
  { id: 'rayas', nombre: 'A rayas' },
  { id: 'liso', nombre: 'Liso' },
  { id: 'ondas', nombre: 'Con ondas' },
  { id: 'ninguno', nombre: 'Sin toldo' },
];
const NINGUNO: OpcionPieza = { id: 'ninguno', nombre: 'Nada' };
const PLANTAS: OpcionPieza = { id: 'plantas', nombre: 'Plantas' };
const FAROL: OpcionPieza = { id: 'farol', nombre: 'Farol' };

/** Piezas de cada villa: así cada villa conserva su arquitectura. La primera opción es la inicial. */
export const CATALOGO_CASA: Record<Barrio, CatalogoCasa> = {
  creativo: {
    techo: [
      { id: 'tejas', nombre: 'Tejas de colores' },
      { id: 'madera', nombre: 'Tejuelas de madera' },
      { id: 'jardin', nombre: 'Techo jardín' },
    ],
    colorTecho: [
      { id: 'coral', nombre: 'Coral', color: '#e07a5f' },
      { id: 'mostaza', nombre: 'Mostaza', color: '#e9b44c' },
      { id: 'salvia', nombre: 'Salvia', color: '#81b29a' },
      { id: 'lavanda', nombre: 'Lavanda', color: '#9b7bc4' },
    ],
    pared: [
      { id: 'liso', nombre: 'Lisa' },
      { id: 'madera', nombre: 'Madera' },
      { id: 'mosaico', nombre: 'Mosaico' },
    ],
    colorPared: [
      { id: 'vainilla', nombre: 'Vainilla', color: '#fdf0dc' },
      { id: 'durazno', nombre: 'Durazno', color: '#fbe0d2' },
      { id: 'pistacho', nombre: 'Pistacho', color: '#e3efd9' },
      { id: 'lila', nombre: 'Lila', color: '#ece3f4' },
    ],
    puerta: PUERTAS,
    ventana: VENTANAS,
    toldo: TOLDOS,
    letrero: [
      { id: 'madera', nombre: 'Tabla de madera' },
      { id: 'pintado', nombre: 'Pintado a mano' },
      { id: 'colgante', nombre: 'Colgante' },
    ],
    frente: [NINGUNO, PLANTAS, FAROL, { id: 'caballete', nombre: 'Caballete' }],
    piso: [
      { id: 'madera', nombre: 'Madera' },
      { id: 'baldosa', nombre: 'Baldosa de colores' },
      { id: 'alfombra', nombre: 'Alfombra tejida' },
    ],
    paredInterior: [
      { id: 'vainilla', nombre: 'Vainilla', color: '#fdf0dc' },
      { id: 'coral', nombre: 'Coral', color: '#e8a08b' },
      { id: 'salvia', nombre: 'Salvia', color: '#a9c9b4' },
      { id: 'lila', nombre: 'Lila', color: '#d9cbe8' },
    ],
    muebles: [
      { id: 'atril', nombre: 'Atril de pintura' },
      { id: 'mesa-dibujo', nombre: 'Mesa de dibujo' },
      { id: 'taller', nombre: 'Taller de cerámica' },
    ],
    decoracion: [
      { id: 'cuadros', nombre: 'Cuadros' },
      { id: 'plantas', nombre: 'Plantas' },
      { id: 'repisas', nombre: 'Repisas con pinturas' },
    ],
  },
  tech: {
    techo: [
      { id: 'solar', nombre: 'Paneles solares' },
      { id: 'vidrio', nombre: 'Tragaluz de vidrio' },
      { id: 'antena', nombre: 'Antenas' },
    ],
    colorTecho: [
      { id: 'acero', nombre: 'Acero', color: '#8aa0b5' },
      { id: 'pizarra', nombre: 'Pizarra', color: '#5f7186' },
      { id: 'niebla', nombre: 'Niebla', color: '#c3cfda' },
      { id: 'noche', nombre: 'Noche', color: '#3f4d63' },
    ],
    pared: [
      { id: 'liso', nombre: 'Lisa' },
      { id: 'metal', nombre: 'Paneles de metal' },
      { id: 'vidrio', nombre: 'Muro de vidrio' },
    ],
    colorPared: [
      { id: 'nube', nombre: 'Nube', color: '#eef2f5' },
      { id: 'hielo', nombre: 'Hielo', color: '#dbe6ef' },
      { id: 'perla', nombre: 'Perla', color: '#e7e4ee' },
      { id: 'menta', nombre: 'Menta', color: '#dcefe8' },
    ],
    puerta: PUERTAS,
    ventana: VENTANAS,
    toldo: TOLDOS,
    letrero: [
      { id: 'neon', nombre: 'Neón' },
      { id: 'pantalla', nombre: 'Pantalla LED' },
      { id: 'placa', nombre: 'Placa' },
    ],
    frente: [NINGUNO, PLANTAS, { id: 'farol', nombre: 'Farol LED' }, { id: 'robot', nombre: 'Robot de reparto' }],
    piso: [
      { id: 'cemento', nombre: 'Cemento pulido' },
      { id: 'madera', nombre: 'Madera clara' },
      { id: 'baldosa', nombre: 'Baldosa gris' },
    ],
    paredInterior: [
      { id: 'nube', nombre: 'Nube', color: '#eef2f5' },
      { id: 'grafito', nombre: 'Grafito', color: '#2f3b4c' },
      { id: 'hielo', nombre: 'Hielo', color: '#dbe6ef' },
      { id: 'azul', nombre: 'Azul', color: '#3d85c6' },
    ],
    muebles: [
      { id: 'escritorio', nombre: 'Escritorio con monitores' },
      { id: 'servidores', nombre: 'Rack de servidores' },
      { id: 'arcade', nombre: 'Máquinas de videojuegos' },
    ],
    decoracion: [
      { id: 'plantas', nombre: 'Plantas' },
      { id: 'pantallas', nombre: 'Pantallas con código' },
      { id: 'luces', nombre: 'Tiras de luz' },
    ],
  },
  audiovisual: {
    techo: [
      { id: 'equipos', nombre: 'Plano con equipos' },
      { id: 'antena', nombre: 'Con antena parabólica' },
      { id: 'reflectores', nombre: 'Con reflectores' },
    ],
    colorTecho: [
      { id: 'grafito', nombre: 'Grafito', color: '#4b4048' },
      { id: 'ciruela', nombre: 'Ciruela', color: '#5d5159' },
      { id: 'noche', nombre: 'Noche', color: '#46557a' },
      { id: 'vino', nombre: 'Vino', color: '#7e3f43' },
    ],
    pared: [
      { id: 'liso', nombre: 'Lisa' },
      { id: 'paneles', nombre: 'Paneles' },
      { id: 'ladrillo', nombre: 'Ladrillo visto' },
    ],
    colorPared: [
      { id: 'crema', nombre: 'Crema', color: '#ecdcc6' },
      { id: 'arena', nombre: 'Arena', color: '#e6d5bd' },
      { id: 'rosa', nombre: 'Rosa palo', color: '#ead3cc' },
      { id: 'piedra', nombre: 'Piedra', color: '#d9cfc1' },
    ],
    puerta: PUERTAS,
    ventana: VENTANAS,
    toldo: TOLDOS,
    letrero: [
      { id: 'placa', nombre: 'Placa' },
      { id: 'marquesina', nombre: 'Marquesina con luces' },
      { id: 'claqueta', nombre: 'Claqueta' },
    ],
    frente: [NINGUNO, FAROL, PLANTAS, { id: 'reflector', nombre: 'Reflector de cine' }, { id: 'cartelera', nombre: 'Cartelera' }],
    piso: [
      { id: 'alfombra', nombre: 'Alfombra roja' },
      { id: 'madera', nombre: 'Madera oscura' },
      { id: 'damero', nombre: 'Damero' },
    ],
    paredInterior: [
      { id: 'vino', nombre: 'Vino', color: '#7e3f43' },
      { id: 'grafito', nombre: 'Grafito', color: '#4b4048' },
      { id: 'crema', nombre: 'Crema', color: '#ecdcc6' },
      { id: 'noche', nombre: 'Noche', color: '#46557a' },
    ],
    muebles: [
      { id: 'set-fotos', nombre: 'Set de fotos' },
      { id: 'sala-edicion', nombre: 'Sala de edición' },
      { id: 'cabina', nombre: 'Cabina de sonido' },
    ],
    decoracion: [
      { id: 'afiches', nombre: 'Afiches de cine' },
      { id: 'focos', nombre: 'Focos de estudio' },
      { id: 'vinilos', nombre: 'Discos de vinilo' },
    ],
  },
  academy: {
    techo: [
      { id: 'tejas', nombre: 'Tejas' },
      { id: 'pizarra', nombre: 'Pizarra' },
      { id: 'buhardilla', nombre: 'Con buhardilla' },
    ],
    colorTecho: [
      { id: 'teja', nombre: 'Teja', color: '#a65f45' },
      { id: 'pizarra', nombre: 'Pizarra', color: '#5b6770' },
      { id: 'nogal', nombre: 'Nogal', color: '#7a4a33' },
      { id: 'musgo', nombre: 'Musgo', color: '#4f6b5a' },
    ],
    pared: [
      { id: 'ladrillo', nombre: 'Ladrillo' },
      { id: 'piedra', nombre: 'Piedra' },
      { id: 'liso', nombre: 'Lisa' },
    ],
    colorPared: [
      { id: 'ladrillo', nombre: 'Ladrillo', color: '#c9785b' },
      { id: 'rojizo', nombre: 'Rojizo', color: '#b5654a' },
      { id: 'marfil', nombre: 'Marfil', color: '#e8dcc8' },
      { id: 'arena', nombre: 'Arena', color: '#d8c9b0' },
    ],
    puerta: PUERTAS,
    ventana: VENTANAS,
    toldo: TOLDOS,
    letrero: [
      { id: 'clasico', nombre: 'Clásico' },
      { id: 'placa', nombre: 'Placa' },
      { id: 'madera', nombre: 'Madera' },
    ],
    frente: [NINGUNO, PLANTAS, FAROL, { id: 'pizarra', nombre: 'Pizarra de tiza' }],
    piso: [
      { id: 'parquet', nombre: 'Parquet' },
      { id: 'baldosa', nombre: 'Baldosa' },
      { id: 'alfombra', nombre: 'Alfombra verde' },
    ],
    paredInterior: [
      { id: 'marfil', nombre: 'Marfil', color: '#e8dcc8' },
      { id: 'verde', nombre: 'Verde', color: '#5d9b78' },
      { id: 'teja', nombre: 'Teja', color: '#c08a6e' },
      { id: 'noche', nombre: 'Noche', color: '#46557a' },
    ],
    muebles: [
      { id: 'aula', nombre: 'Aula' },
      { id: 'biblioteca', nombre: 'Biblioteca' },
      { id: 'mesa-redonda', nombre: 'Mesa redonda' },
    ],
    decoracion: [
      { id: 'diplomas', nombre: 'Diplomas' },
      { id: 'plantas', nombre: 'Plantas' },
      { id: 'mapa', nombre: 'Mapa y globo' },
    ],
  },
};

/** Casa inicial de una villa: las piezas base (la primera opción de cada parte). */
export function casaPorDefecto(barrio: Barrio): AparienciaCasa {
  const catalogo = CATALOGO_CASA[barrio];
  return Object.fromEntries(Object.entries(catalogo).map(([campo, opciones]) => [campo, opciones[0].id])) as unknown as AparienciaCasa;
}

const NOMBRES_CASA = Object.fromEntries(CAMPOS_CASA.map((c) => [c.campo, c.nombre]));

/** Valida una casa completa contra las piezas de su villa (la usa la API en PUT /mi-local). */
export function validarAparienciaCasa(barrio: Barrio, valor: unknown): ResultadoValidacion<AparienciaCasa> {
  return validarContra<AparienciaCasa>(CATALOGO_CASA[barrio], NOMBRES_CASA, valor, 'de la casa');
}

/** Deja una casa lista para dibujar en su villa: las piezas que no sean de la villa se cambian por las base. */
export function normalizarAparienciaCasa(barrio: Barrio, valor: unknown): AparienciaCasa {
  return normalizarContra(CATALOGO_CASA[barrio], valor, casaPorDefecto(barrio));
}
