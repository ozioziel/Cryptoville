// El CV de una persona (Plaza principal), al estilo de LinkedIn. Cada parte lleva `publico` (sí por defecto):
// - experiencia, educación, licencias y certificaciones, premios y voluntariado: tabla `experiencias` (`tipo`);
// - acerca de mí, habilidades, idiomas y el PDF: tabla `cvs` (privada) y la vista `cvs_publicos`, que solo
//   deja ver lo que la persona marcó como público;
// - proyectos (portafolio) y trabajos verificados («Mis trabajos»).
// Los topes están en reglas.ts (`cv`).

export const TIPOS_EXPERIENCIA = ['trabajo', 'educacion', 'certificacion', 'premio', 'voluntariado'] as const;
export type TipoExperiencia = (typeof TIPOS_EXPERIENCIA)[number];

export interface DatosSeccionCv {
  /** Título de la sección («Experiencia», «Educación»…). */
  titulo: string;
  /** Botón para sumar uno («Sumar experiencia»…). */
  sumar: string;
  /** Etiquetas de los campos `puesto` y `lugar` de la tabla. */
  puesto: string;
  lugar: string;
  ejemploPuesto: string;
  ejemploLugar: string;
  /** Tiene fecha de fin («hasta») o una sola fecha. */
  conFin: boolean;
  /** Etiqueta de la fecha de inicio (o la única). */
  fecha: string;
  /** Etiqueta de la fecha de fin. */
  fin?: string;
  /** Tiene enlace (la credencial de una certificación). */
  enlace?: string;
}

export const SECCIONES_CV: Record<TipoExperiencia, DatosSeccionCv> = {
  trabajo: {
    titulo: 'Experiencia',
    sumar: 'Sumar experiencia',
    puesto: 'Puesto',
    lugar: 'Dónde',
    ejemploPuesto: 'Diseñadora gráfica',
    ejemploLugar: 'Estudio, empresa o por mi cuenta',
    conFin: true,
    fecha: 'Desde',
    fin: 'Hasta (vacío si sigues ahí)',
  },
  educacion: {
    titulo: 'Educación',
    sumar: 'Sumar estudios',
    puesto: 'Título o carrera',
    lugar: 'Institución',
    ejemploPuesto: 'Licenciatura en Diseño',
    ejemploLugar: 'Universidad, instituto o academia',
    conFin: true,
    fecha: 'Desde',
    fin: 'Hasta (vacío si sigues estudiando)',
  },
  certificacion: {
    titulo: 'Licencias y certificaciones',
    sumar: 'Sumar certificación',
    puesto: 'Nombre',
    lugar: 'Quién la emite',
    ejemploPuesto: 'Google UX Design',
    ejemploLugar: 'Coursera, Google…',
    conFin: true,
    fecha: 'Fecha de emisión',
    fin: 'Vence (vacío si no vence)',
    enlace: 'Enlace a la credencial (https)',
  },
  premio: {
    titulo: 'Premios y reconocimientos',
    sumar: 'Sumar premio',
    puesto: 'Nombre',
    lugar: 'Quién lo otorga',
    ejemploPuesto: 'Primer lugar en el concurso de afiches',
    ejemploLugar: 'Organización o evento',
    conFin: false,
    fecha: 'Fecha',
  },
  voluntariado: {
    titulo: 'Voluntariado',
    sumar: 'Sumar voluntariado',
    puesto: 'Rol',
    lugar: 'Organización',
    ejemploPuesto: 'Profesora de dibujo',
    ejemploLugar: 'Fundación, comunidad…',
    conFin: true,
    fecha: 'Desde',
    fin: 'Hasta (vacío si sigues)',
  },
};

export const NIVELES_IDIOMA = ['basico', 'intermedio', 'avanzado', 'nativo'] as const;
export type NivelIdioma = (typeof NIVELES_IDIOMA)[number];
export const NOMBRE_NIVEL_IDIOMA: Record<NivelIdioma, string> = {
  basico: 'Básico',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
  nativo: 'Nativo',
};

export interface Idioma {
  idioma: string;
  nivel: NivelIdioma;
}

/** El CV como lo ve su dueña (tabla `cvs`): todo, con qué es público. */
export interface CvPropio {
  usuario_id: string;
  acerca_de: string | null;
  acerca_publico: boolean;
  habilidades: string[];
  habilidades_publicas: boolean;
  idiomas: Idioma[];
  idiomas_publicos: boolean;
  /** Ruta del PDF en el bucket público `cvs` (o null). */
  pdf_ruta: string | null;
  pdf_publico: boolean;
  /** Lo ocultó el equipo después de un reporte. */
  oculto: boolean;
  actualizado_en: string;
}

/** El CV como lo ven los demás (vista `cvs_publicos`): lo que no es público llega vacío. */
export interface CvPublico {
  usuario_id: string;
  acerca_de: string | null;
  habilidades: string[];
  idiomas: Idioma[];
  pdf_ruta: string | null;
  actualizado_en: string;
}

/** ¿Ya armó su CV? (para la recomendación «Arma tu CV en la Plaza»). */
export function cvArmado(cv: Pick<CvPublico, 'acerca_de' | 'habilidades' | 'idiomas' | 'pdf_ruta'> | null, experiencias = 0): boolean {
  if (experiencias > 0) return true;
  if (!cv) return false;
  return Boolean(cv.acerca_de?.trim() || cv.habilidades.length || cv.idiomas.length || cv.pdf_ruta);
}
