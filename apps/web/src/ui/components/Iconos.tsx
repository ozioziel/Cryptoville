import type { Barrio } from '@cryptoville/shared';

/** Íconos de trazo simple (24 × 24), como los de la muestra aprobada. Reemplazan a los emojis. */
const TRAZOS = {
  buscar: <><circle cx="11" cy="11" r="6" /><path d="M16 16L20 20" /></>,
  pedidos: <path d="M4 8L12 4L20 8V16L12 20L4 16ZM4 8L12 12L20 8M12 12V20" />,
  campana: <path d="M6 16V11A6 6 0 0 1 18 11V16L20 18H4ZM10 21H14" />,
  escudo: <path d="M12 3L19 6V11C19 16 15.5 19.5 12 21C8.5 19.5 5 16 5 11V6ZM9 12L11 14L15 10" />,
  cerrar: <path d="M6 6L18 18M18 6L6 18" />,
  atras: <path d="M15 5L8 12L15 19" />,
  flecha: <path d="M9 5L16 12L9 19" />,
  estrella: <path d="M12 4L14.4 9L19.8 9.6L15.8 13.2L16.9 18.6L12 15.9L7.1 18.6L8.2 13.2L4.2 9.6L9.6 9Z" />,
  reloj: <><circle cx="12" cy="12" r="8" /><path d="M12 8V12L15 14" /></>,
  copiar: <><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6C16 5 15 4 14 4H6C5 4 4 5 4 6V14C4 15 5 16 6 16H8" /></>,
  enlace: <path d="M14 5H19V10M19 5L11 13M17 14V18C17 19 16 20 15 20H6C5 20 4 19 4 18V9C4 8 5 7 6 7H10" />,
  salir: <path d="M10 5H6C5 5 4 6 4 7V17C4 18 5 19 6 19H10M15 8L19 12L15 16M19 12H9" />,
  editar: <path d="M5 19L5.5 15.5L15.5 5.5C16.3 4.7 17.7 4.7 18.5 5.5C19.3 6.3 19.3 7.7 18.5 8.5L8.5 18.5ZM14 7L17 10" />,
  mas: <path d="M12 5V19M5 12H19" />,
  usuario: <><circle cx="12" cy="9" r="4" /><path d="M5 20C6 16 9 14.5 12 14.5C15 14.5 18 16 19 20" /></>,
  balanza: <path d="M12 4V20M7 20H17M5 8H19M5 8L2.5 14C3.5 15.5 6.5 15.5 7.5 14ZM19 8L16.5 14C17.5 15.5 20.5 15.5 21.5 14Z" />,
  chat: <path d="M5 6H19C20 6 20 7 20 7V15C20 16 19 16 19 16H10L6 19.5V16H5C4 16 4 15 4 15V7C4 6 5 6 5 6Z" />,
  maletin: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5.5C9 4.7 9.7 4 10.5 4H13.5C14.3 4 15 4.7 15 5.5V7M3 12.5H21" /></>,
  chincheta: <path d="M9 3H15L14 9L17 12V14H7V12L10 9ZM12 14V21" />,
  foco: <path d="M9 18H15M10 21H14M12 3C8.7 3 6.5 5.6 6.5 8.5C6.5 10.6 7.6 12 8.6 13C9.2 13.6 9.5 14.4 9.5 15.2V15.5H14.5V15.2C14.5 14.4 14.8 13.6 15.4 13C16.4 12 17.5 10.6 17.5 8.5C17.5 5.6 15.3 3 12 3Z" />,
  // Villas (las de la muestra).
  creativo: <path d="M5 19L13 11M12 8L16 12L19 9C20 8 20 6 19 5C18 4 16 4 15 5Z" />,
  tech: <><rect x="7" y="7" width="10" height="10" rx="2" /><path d="M10 4V7M14 4V7M10 17V20M14 17V20M4 10H7M4 14H7M17 10H20M17 14H20" /></>,
  audiovisual: <><rect x="3" y="7" width="18" height="12" rx="3" /><circle cx="12" cy="13" r="3.5" /><path d="M8 7L9.5 4.5H14.5L16 7" /></>,
  academy: <path d="M3 6C6 5 9 5 12 7C15 5 18 5 21 6V19C18 18 15 18 12 20C9 18 6 18 3 19ZM12 7V20" />,
} as const;

export type NombreIcono = keyof typeof TRAZOS;

export function Icono({ nombre, tamano = 18, color, etiqueta }: { nombre: NombreIcono | Barrio; tamano?: number; color?: string; etiqueta?: string }) {
  return (
    <svg
      className="ico"
      viewBox="0 0 24 24"
      width={tamano}
      height={tamano}
      style={color ? { color } : undefined}
      role={etiqueta ? 'img' : undefined}
      aria-label={etiqueta}
      aria-hidden={etiqueta ? undefined : true}
      focusable="false"
    >
      {TRAZOS[nombre]}
    </svg>
  );
}

/** Logo: ícono de casa sobre un cuadrado coral. */
export function LogoIcono({ tamano = 24 }: { tamano?: number }) {
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect width="24" height="24" rx="7" fill="#e07a5f" />
      <path d="M6 12L12 7L18 12V18H6Z" fill="#fdf6e3" />
      <circle cx="12" cy="14" r="2.2" fill="#e07a5f" />
    </svg>
  );
}
