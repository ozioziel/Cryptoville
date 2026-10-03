// Carga el .env de la raíz del monorepo (en desarrollo y pruebas).
// En Docker las variables ya vienen del entorno y el archivo no existe: no pasa nada.
import { config } from 'dotenv';
import path from 'node:path';

config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
