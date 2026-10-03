#!/usr/bin/env node
// Genera el mapa del pueblo en formato Tiled (JSON): apps/web/public/assets/mapas/pueblo.json
// Se puede abrir y editar después en Tiled (https://www.mapeditor.org/).
// Uso: npm run map:generate
//
// Tiles de Kenney "Tiny Town" (16×16, 12 columnas). Índices (base 0) del tilesheet:
//   pasto 0-2 · árboles 3,15,16,27,28 · arbusto 5 · hongos 29 · camino 25/40 · plaza 43
//   techos 48-55/60-67 · paredes y puertas 72-91 · cercas 44-47,56-59,68-71,80-82
//   letrero 83 · pozo 92/104 · heno 93 · colmena 94
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const salida = path.join(raiz, 'apps/web/public/assets/mapas/pueblo.json');

const ANCHO = 48;
const ALTO = 34;
const VACIO = -1;

// Generador pseudoaleatorio con semilla: el mapa sale igual cada vez.
let semilla = 20261003;
const azar = () => {
  semilla = (semilla * 1664525 + 1013904223) % 4294967296;
  return semilla / 4294967296;
};

const capa = () => Array.from({ length: ALTO }, () => Array(ANCHO).fill(VACIO));
const suelo = capa();
const caminos = capa();
const edificios = capa();
const ocupado = Array.from({ length: ALTO }, () => Array(ANCHO).fill(false));

const poner = (c, x, y, tile) => {
  if (x >= 0 && y >= 0 && x < ANCHO && y < ALTO) {
    c[y][x] = tile;
    if (c !== suelo) ocupado[y][x] = true;
  }
};
const rect = (c, x0, y0, x1, y1, tile) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) poner(c, x, y, typeof tile === 'function' ? tile(x, y) : tile);
};

// 1. Pasto con algo de variedad.
rect(suelo, 0, 0, ANCHO - 1, ALTO - 1, () => {
  const r = azar();
  return r < 0.08 ? 1 : r < 0.11 ? 2 : 0;
});

// 2. Caminos: calle principal, calle del sur, avenida central y plaza.
rect(caminos, 1, 15, ANCHO - 2, 16, (x, y) => (y === 15 ? 40 : 25));
rect(caminos, 2, 23, ANCHO - 3, 24, (x, y) => (y === 23 ? 40 : 25));
rect(caminos, 23, 1, 24, ALTO - 2, 25);
rect(caminos, 19, 17, 28, 21, 43);

// 3. Casas: 3×3 (techo de 2 filas + pared con puerta al centro).
const MODELOS = {
  diseno: [[52, 53, 54], [64, 65, 66], [84, 86, 84]],
  clases: [[52, 55, 54], [64, 67, 66], [72, 74, 75]],
  tecnologia: [[48, 49, 50], [60, 61, 62], [88, 89, 88]],
};
const LOTES = [
  // Diseño (noroeste) y Clases (noreste): frente a la calle principal.
  { lote: 1, barrio: 'diseno', x: 3, y: 12 },
  { lote: 2, barrio: 'diseno', x: 8, y: 12 },
  { lote: 3, barrio: 'diseno', x: 13, y: 12 },
  { lote: 4, barrio: 'diseno', x: 18, y: 12 },
  { lote: 5, barrio: 'clases', x: 28, y: 12 },
  { lote: 6, barrio: 'clases', x: 33, y: 12 },
  { lote: 7, barrio: 'clases', x: 38, y: 12 },
  { lote: 8, barrio: 'clases', x: 43, y: 12 },
  // Tecnología (sur): frente a la calle del sur.
  { lote: 9, barrio: 'tecnologia', x: 4, y: 20 },
  { lote: 10, barrio: 'tecnologia', x: 10, y: 20 },
  { lote: 11, barrio: 'tecnologia', x: 31, y: 20 },
  { lote: 12, barrio: 'tecnologia', x: 37, y: 20 },
];
for (const l of LOTES) {
  MODELOS[l.barrio].forEach((fila, dy) => fila.forEach((tile, dx) => poner(edificios, l.x + dx, l.y + dy, tile)));
}

// 4. Plaza: pozo, letrero y cercas decorativas.
poner(edificios, 20, 18, 92);
poner(edificios, 20, 19, 104);
poner(edificios, 27, 18, 83);
poner(edificios, 26, 20, 93);
poner(edificios, 21, 20, 94);

// 5. Árboles y arbustos donde no hay nada (sin tapar caminos ni frentes de casas).
const libre = (x, y) => {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const yy = y + dy;
      const xx = x + dx;
      if (yy < 0 || xx < 0 || yy >= ALTO || xx >= ANCHO) continue;
      if (ocupado[yy][xx]) return false;
    }
  }
  return true;
};
const zonasArbolado = [
  [0, 0, ANCHO - 1, 10],
  [0, 26, ANCHO - 1, ALTO - 1],
  [0, 17, 2, 22],
  [ANCHO - 3, 17, ANCHO - 1, 22],
  [14, 17, 17, 21],
];
const ARBOLES = [16, 28, 16, 5, 28, 3, 15, 27, 29];
for (const [x0, y0, x1, y1] of zonasArbolado) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const borde = x === 0 || y === 0 || x === ANCHO - 1 || y === ALTO - 1;
      if ((borde && azar() < 0.7) || (!borde && azar() < 0.16 && libre(x, y))) {
        if (!ocupado[y][x]) poner(edificios, x, y, ARBOLES[Math.floor(azar() * ARBOLES.length)]);
      }
    }
  }
}
// Cerca de la granja del sur.
rect(edificios, 30, 28, 34, 28, 81);
poner(edificios, 29, 28, 80);
poner(edificios, 35, 28, 82);

// ---- Formato Tiled ----
const COLISIONAN = [3, 4, 5, 15, 16, 27, 28, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 104];

const datos = (c) => c.flat().map((t) => (t === VACIO ? 0 : t + 1));
const capaTiled = (id, nombre, c) => ({
  id, name: nombre, type: 'tilelayer', width: ANCHO, height: ALTO, x: 0, y: 0, opacity: 1, visible: true, data: datos(c),
});
const prop = (name, type, value) => ({ name, type, value });

const objetos = [
  ...LOTES.map((l, i) => ({
    id: i + 1,
    name: `lote-${l.lote}`,
    type: 'lote',
    x: l.x * 16,
    y: l.y * 16,
    width: 48,
    height: 48,
    visible: true,
    rotation: 0,
    properties: [
      prop('lote', 'int', l.lote),
      prop('barrio', 'string', l.barrio),
      // Puerta: tile del medio de la fila de abajo de la casa.
      prop('puertaX', 'int', l.x + 1),
      prop('puertaY', 'int', l.y + 2),
    ],
  })),
  { id: 20, name: 'barrio-diseno', type: 'barrio', x: 12 * 16, y: 10 * 16, width: 0, height: 0, point: true, visible: true, rotation: 0, properties: [prop('texto', 'string', 'Barrio Diseño')] },
  { id: 21, name: 'barrio-clases', type: 'barrio', x: 36 * 16, y: 10 * 16, width: 0, height: 0, point: true, visible: true, rotation: 0, properties: [prop('texto', 'string', 'Barrio Clases')] },
  { id: 22, name: 'barrio-tecnologia', type: 'barrio', x: 21 * 16, y: 25.5 * 16, width: 0, height: 0, point: true, visible: true, rotation: 0, properties: [prop('texto', 'string', 'Barrio Tecnología')] },
  { id: 23, name: 'plaza', type: 'barrio', x: 24 * 16, y: 21.6 * 16, width: 0, height: 0, point: true, visible: true, rotation: 0, properties: [prop('texto', 'string', 'Plaza')] },
  { id: 30, name: 'inicio', type: 'inicio', x: 24 * 16, y: 17 * 16, width: 0, height: 0, point: true, visible: true, rotation: 0, properties: [] },
];

const mapa = {
  compressionlevel: -1,
  type: 'map',
  version: '1.10',
  tiledversion: '1.11.0',
  orientation: 'orthogonal',
  renderorder: 'right-down',
  infinite: false,
  width: ANCHO,
  height: ALTO,
  tilewidth: 16,
  tileheight: 16,
  nextlayerid: 5,
  nextobjectid: 31,
  properties: [prop('creditos', 'string', 'Tiles: Kenney Tiny Town (CC0) - kenney.nl')],
  tilesets: [
    {
      firstgid: 1,
      name: 'tiny-town',
      image: '../kenney/tiny-town.png',
      imagewidth: 192,
      imageheight: 176,
      tilewidth: 16,
      tileheight: 16,
      tilecount: 132,
      columns: 12,
      margin: 0,
      spacing: 0,
      tiles: COLISIONAN.map((id) => ({ id, properties: [prop('colisiona', 'bool', true)] })),
    },
  ],
  layers: [
    capaTiled(1, 'suelo', suelo),
    capaTiled(2, 'caminos', caminos),
    capaTiled(3, 'edificios', edificios),
    { id: 4, name: 'objetos', type: 'objectgroup', draworder: 'topdown', opacity: 1, visible: true, x: 0, y: 0, objects: objetos },
  ],
};

mkdirSync(path.dirname(salida), { recursive: true });
writeFileSync(salida, JSON.stringify(mapa));
console.log(`Mapa generado: ${path.relative(raiz, salida)} (${ANCHO}×${ALTO} tiles, ${LOTES.length} lotes)`);
