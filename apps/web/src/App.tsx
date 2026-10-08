import { BARRIOS, LISTA_BARRIOS, aparienciaDeUsuario, type AparienciaPersona, type Barrio } from '@cryptoville/shared';
import { useEffect, useRef, useState } from 'react';
import { COLOR_SE_BUSCA } from './arte/casa';
import { edificioCentral } from './arte/villa';
import { seBuscaEnMapa, type BusquedaPublica } from './features/busquedas/datos';
import { ProveedorSesion, useSesion } from './features/auth/sesion';
import { localEnMapa, type LocalDelPueblo } from './features/services/datos';
import { emitir, escuchar, type ModoVilla, type Puerta } from './game/EventBus';
import { PhaserGame } from './game/PhaserGame';
import { cargarConfig, type ConfigPublica } from './lib/config';
import { mensajeDeError } from './lib/api';
import { Avatar } from './ui/components/basicos';
import { Icono, LogoIcono } from './ui/components/Iconos';
import { Joystick } from './ui/components/Joystick';
import { Panel } from './ui/components/Panel';
import { ProveedorEstado, useEstado, type PanelAbierto } from './ui/estado';
import { portadaDe } from './ui/villas';
import { PanelArbitro } from './ui/panels/PanelArbitro';
import { PanelAvisos } from './ui/panels/PanelAvisos';
import { PanelBienvenida } from './ui/panels/PanelBienvenida';
import { PanelBuscar } from './ui/panels/PanelBuscar';
import { PanelBusqueda } from './ui/panels/PanelBusqueda';
import { PanelDatosCuriosos } from './ui/panels/PanelDatosCuriosos';
import { PanelLote } from './ui/panels/PanelLote';
import { PanelMiLocal } from './ui/panels/PanelMiLocal';
import { PanelPedido } from './ui/panels/PanelPedido';
import { PanelPedidos } from './ui/panels/PanelPedidos';
import { PanelPerfil } from './ui/panels/PanelPerfil';
import { PanelPublicarBusqueda } from './ui/panels/PanelPublicarBusqueda';
import { PanelServicio } from './ui/panels/PanelServicio';

const esTactil = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

/** Pista de la lupa en el modo «Quiero contratar», con las categorías de la villa. */
const TEXTO_BUSCAR: Record<Barrio, string> = {
  creativo: 'Buscar diseño, ilustración, branding…',
  tech: 'Buscar web, apps, videojuegos…',
  audiovisual: 'Buscar fotografía, música, cine…',
  academy: 'Buscar cursos, idiomas, mentorías…',
};

export function App() {
  const [config, setConfig] = useState<ConfigPublica | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    cargarConfig().then(setConfig, (e) => setError(mensajeDeError(e)));
  }, []);

  if (error) {
    return (
      <div className="pantalla-error">
        <div className="pantalla-tarjeta">
          <h1>
            <LogoIcono tamano={32} /> WorkVille
          </h1>
          <p>{error}</p>
          <button type="button" className="boton boton-primario" onClick={() => location.reload()}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }
  if (!config) {
    return (
      <div className="pantalla-error">
        <div className="pantalla-tarjeta">
          <h1>
            <LogoIcono tamano={32} /> WorkVille
          </h1>
          <p className="tenue cargando">Cargando WorkVille…</p>
        </div>
      </div>
    );
  }
  return (
    <ProveedorSesion>
      <ProveedorEstado>
        <Pueblo />
      </ProveedorEstado>
    </ProveedorSesion>
  );
}

function Pueblo() {
  const { usuario } = useSesion();
  const { panel, abrir, cerrar, atras, puedeVolver, locales, notificaciones, descartar, avisosSinLeer, villa, irAVilla, modo, cambiarModo, seBusca } =
    useEstado();
  const [puertaCercana, setPuertaCercana] = useState<Puerta | null>(null);
  const interiorAbierto = useRef(false);
  const [tactil] = useState(esTactil);

  // Primera visita: bienvenida.
  useEffect(() => {
    try {
      if (!localStorage.getItem('cryptoville-visto')) abrir({ tipo: 'bienvenida' });
    } catch {
      abrir({ tipo: 'bienvenida' });
    }
  }, [abrir]);

  // Eventos que vienen del juego.
  const localesRef = useRef(locales);
  localesRef.current = locales;
  const seBuscaRef = useRef(seBusca);
  seBuscaRef.current = seBusca;
  const modoRef = useRef(modo);
  modoRef.current = modo;
  const aparienciaRef = useRef<AparienciaPersona | null>(null);
  aparienciaRef.current = usuario ? aparienciaDeUsuario(usuario) : null;
  const hayPanel = useRef(false);
  hayPanel.current = panel !== null;
  useEffect(() => {
    const quitar = [
      escuchar('cerca-de-puerta', setPuertaCercana),
      escuchar('entrar-puerta', (p) => {
        if (p.tipo === 'edificio') {
          abrir({ tipo: 'datos-curiosos', barrio: p.barrio });
          return;
        }
        // Modo «Quiero trabajar»: la casa es un «Se busca»; se entra igual que a un local.
        if (p.tipo === 'se-busca' && p.busquedaId) {
          const b = seBuscaRef.current.find((x) => x.id === p.busquedaId);
          if (b) {
            interiorAbierto.current = true;
            emitir('abrir-interior', {
              nombre: b.titulo,
              avatarDueno: b.autor.avatar,
              aparienciaDueno: b.autor.apariencia,
              barrio: b.barrio,
              color: COLOR_SE_BUSCA,
              aparienciaCasa: null,
            });
          }
          abrir({ tipo: 'busqueda', id: p.busquedaId });
          return;
        }
        // En ese modo, el lote disponible sirve para publicar un «Se busca» en esa villa.
        if (p.tipo === 'lote-libre' && modoRef.current === 'trabajar') {
          abrir({ tipo: 'publicar-busqueda', barrio: p.barrio });
          return;
        }
        if (p.lote === null) return;
        const local = localesRef.current.find((l) => l.barrio === p.barrio && l.lote === p.lote);
        if (local) {
          interiorAbierto.current = true;
          emitir('abrir-interior', {
            nombre: local.nombre,
            avatarDueno: local.usuario.avatar,
            aparienciaDueno: local.usuario.apariencia,
            barrio: local.barrio,
            color: local.color,
            aparienciaCasa: local.apariencia,
          });
        }
        abrir({ tipo: 'lote', lote: p.lote, barrio: p.barrio });
      }),
      escuchar('salio-del-local', () => cerrar()),
      escuchar('pueblo-listo', () => {
        emitir('locales', localesRef.current.map(localEnMapa));
        emitir('se-busca', seBuscaRef.current.map(seBuscaEnMapa));
        emitir('modo', modoRef.current);
        if (aparienciaRef.current) emitir('apariencia', aparienciaRef.current);
        // La escena recién creada no sabe si hay un panel abierto (por ejemplo, la bienvenida).
        emitir('controles', !hayPanel.current);
      }),
    ];
    return () => quitar.forEach((f) => f());
  }, [abrir, cerrar]);

  useEffect(() => {
    if (usuario) emitir('apariencia', aparienciaDeUsuario(usuario));
  }, [usuario]);

  // Al cerrar todos los paneles, se sale del interior.
  useEffect(() => {
    if (!panel && interiorAbierto.current) {
      interiorAbierto.current = false;
      emitir('cerrar-local');
    }
  }, [panel]);

  const cerrarBienvenida = () => {
    try {
      localStorage.setItem('cryptoville-visto', '1');
    } catch {
      // Sin almacenamiento local: se volverá a mostrar la bienvenida.
    }
    cerrar();
  };

  const enVilla = modo === 'trabajar' ? seBusca.filter((b) => b.barrio === villa).length : locales.filter((l) => l.barrio === villa).length;
  const queHay = modo === 'trabajar' ? '«Se busca»' : enVilla === 1 ? 'local' : 'locales';
  const textoEntrar = textoPuerta(puertaCercana, modo, locales, seBusca);
  /** El interruptor solo cambia el modo: la villa se arma con las otras casas (no se abre ninguna lista). */
  const elegirModo = (m: ModoVilla) => {
    if (m === modo) return;
    cerrar();
    cambiarModo(m);
  };

  return (
    <div className="app">
      <PhaserGame />
      <header className="barra">
        <div className="barra-lado">
          <button type="button" className="pastilla logo" onClick={() => abrir({ tipo: 'bienvenida' })} aria-label="WorkVille: ¿cómo funciona?">
            <LogoIcono />
            <span className="solo-ancho-medio">WorkVille</span>
          </button>
          <div className="pastilla villa-actual">
            <span className="punto" style={{ background: BARRIOS[villa].color }} />
            <span>
              <span className="solo-ancho-medio">Villa </span>
              {BARRIOS[villa].nombre}
            </span>
            <span className="tenue solo-ancho">
              · {enVilla} {queHay}
            </span>
          </div>
        </div>

        {/* Modo de la villa: los dos lados del mercado. Cambia las casas, no el diseño. */}
        <div className="modo" role="radiogroup" aria-label="Modo de la villa">
          <button
            type="button"
            role="radio"
            aria-checked={modo === 'contratar'}
            className={`modo-boton contratar ${modo === 'contratar' ? 'activo' : ''}`}
            onClick={() => elegirModo('contratar')}
            aria-label="Quiero contratar: la villa muestra los locales"
            title="Quiero contratar"
          >
            <Icono nombre="buscar" color={modo === 'contratar' ? undefined : '#e07a5f'} />
            <span className="solo-ancho-barra">Quiero contratar</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={modo === 'trabajar'}
            className={`modo-boton trabajar ${modo === 'trabajar' ? 'activo' : ''}`}
            onClick={() => elegirModo('trabajar')}
            aria-label="Quiero trabajar: la villa muestra los Se busca"
            title="Quiero trabajar"
          >
            <Icono nombre="maletin" color={modo === 'trabajar' ? undefined : '#c9952e'} />
            <span className="solo-ancho-barra">Quiero trabajar</span>
          </button>
        </div>

        <div className="barra-lado barra-derecha">
          <button
            type="button"
            className="pastilla cuadro"
            onClick={() => abrir({ tipo: 'buscar', pestana: modo === 'trabajar' ? 'se-busca' : 'servicios' })}
            aria-label={modo === 'trabajar' ? 'Buscar en los Se busca' : 'Buscar servicios'}
            title={modo === 'trabajar' ? 'Buscar en los «Se busca»' : TEXTO_BUSCAR[villa]}
          >
            <Icono nombre="buscar" />
          </button>
          {usuario ? (
            <>
              <button type="button" className="pastilla" onClick={() => abrir({ tipo: 'pedidos' })} aria-label="Mis pedidos">
                <Icono nombre="pedidos" />
                <span className="solo-ancho">Mis pedidos</span>
              </button>
              <button type="button" className="pastilla cuadro" onClick={() => abrir({ tipo: 'avisos' })} aria-label={`Avisos: ${avisosSinLeer} sin leer`}>
                <Icono nombre="campana" />
                {avisosSinLeer > 0 && <span className="contador">{avisosSinLeer > 99 ? '99+' : avisosSinLeer}</span>}
              </button>
              <button type="button" className="pastilla cuadro pastilla-avatar" onClick={() => abrir({ tipo: 'perfil' })} aria-label={`Mi perfil: ${usuario.nombre}`}>
                <Avatar frame={usuario.avatar} apariencia={usuario.apariencia} tamano={40} titulo={usuario.nombre} />
              </button>
            </>
          ) : (
            <button type="button" className="pastilla pastilla-primaria" onClick={() => abrir({ tipo: 'bienvenida' })}>
              Entrar
            </button>
          )}
        </div>
      </header>

      <nav className="villas" aria-label="Villas">
        {LISTA_BARRIOS.map((b) => {
          const activa = b === villa;
          return (
            <button
              key={b}
              type="button"
              className={`villa ${activa ? 'activa' : ''}`}
              aria-current={activa ? 'true' : undefined}
              aria-label={`Villa ${BARRIOS[b].nombre}`}
              style={activa ? { background: BARRIOS[b].colorSuave, color: BARRIOS[b].colorOscuro } : undefined}
              onClick={() => !activa && irAVilla(b)}
            >
              <Icono nombre={b} color={activa ? undefined : BARRIOS[b].color} />
              <span className="villa-nombre">{BARRIOS[b].nombre}</span>
            </button>
          );
        })}
      </nav>

      {!panel && textoEntrar && (
        <button type="button" className="boton boton-primario boton-entrar" onClick={() => emitir('pedir-entrar')}>
          {textoEntrar}
          {!tactil && <kbd>E</kbd>}
        </button>
      )}
      {!panel && !tactil && !textoEntrar && <p className="ayuda-controles">Camina con las flechas o WASD · entra con E</p>}
      {tactil && !panel && <Joystick />}

      {panel && (
        <Panel
          titulo={tituloPanel(panel, locales, villa)}
          portada={portadaPanel(panel, locales, villa)}
          amplio={['pedido', 'perfil', 'mi-local', 'arbitro', 'busqueda'].includes(panel.tipo)}
          onCerrar={panel.tipo === 'bienvenida' ? cerrarBienvenida : cerrar}
          onAtras={puedeVolver ? atras : undefined}
        >
          {contenidoPanel(panel, cerrarBienvenida, villa)}
        </Panel>
      )}

      <div className="notificaciones" aria-live="polite">
        {notificaciones.map((n) => (
          <div key={n.id} className="notificacion">
            <button
              type="button"
              className="notificacion-texto"
              onClick={() => {
                descartar(n.id);
                if (n.pedidoId) abrir({ tipo: 'pedido', id: n.pedidoId });
                else if (n.busquedaId) abrir({ tipo: 'busqueda', id: n.busquedaId });
              }}
            >
              {n.texto}
            </button>
            <button type="button" className="boton-icono" onClick={() => descartar(n.id)} aria-label="Descartar">
              <Icono nombre="cerrar" tamano={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function textoPuerta(p: Puerta | null, modo: ModoVilla, locales: LocalDelPueblo[], seBusca: BusquedaPublica[]): string | null {
  if (!p) return null;
  if (p.tipo === 'lote-libre') return modo === 'trabajar' ? 'Publicar lo que necesitas' : 'Ver lote disponible';
  if (p.tipo === 'edificio') return `Entrar a ${edificioCentral(p.barrio).nombre}`;
  if (p.tipo === 'se-busca') {
    const b = seBusca.find((x) => x.id === p.busquedaId);
    return b ? `Entrar a «${b.titulo}»` : 'Ver el «Se busca»';
  }
  const local = locales.find((l) => l.barrio === p.barrio && l.lote === p.lote);
  return local ? `Entrar a ${local.nombre}` : 'Ver lote disponible';
}

function localDelPanel(p: Extract<PanelAbierto, { tipo: 'lote' }>, locales: LocalDelPueblo[], villa: Barrio) {
  return locales.find((l) => l.lote === p.lote && l.barrio === (p.barrio ?? villa));
}

function portadaPanel(p: PanelAbierto, locales: LocalDelPueblo[], villa: Barrio): string | undefined {
  if (p.tipo === 'lote') {
    const local = localDelPanel(p, locales, villa);
    return local ? portadaDe(local.barrio) : undefined;
  }
  if (p.tipo === 'datos-curiosos') return portadaDe(p.barrio);
  return undefined;
}

function tituloPanel(p: PanelAbierto, locales: LocalDelPueblo[], villa: Barrio): string {
  switch (p.tipo) {
    case 'bienvenida':
      return 'Bienvenido a WorkVille';
    case 'lote':
      return localDelPanel(p, locales, villa)?.nombre ?? 'Lote disponible';
    case 'servicio':
      return 'Servicio';
    case 'pedidos':
      return 'Mis pedidos';
    case 'pedido':
      return 'Pedido';
    case 'perfil':
      return 'Mi perfil';
    case 'mi-local':
      return 'Mi local';
    case 'buscar':
      return p.pestana === 'se-busca' ? 'Quiero trabajar' : 'Quiero contratar';
    case 'arbitro':
      return 'Panel del árbitro';
    case 'avisos':
      return 'Avisos';
    case 'datos-curiosos':
      return edificioCentral(p.barrio).nombre;
    case 'busqueda':
      return 'Se busca';
    case 'publicar-busqueda':
      return 'Publicar un «Se busca»';
  }
}

function contenidoPanel(p: PanelAbierto, cerrarBienvenida: () => void, villa: Barrio) {
  switch (p.tipo) {
    case 'bienvenida':
      return <PanelBienvenida onListo={cerrarBienvenida} />;
    case 'lote':
      return <PanelLote lote={p.lote} barrio={p.barrio ?? villa} />;
    case 'servicio':
      return <PanelServicio servicioId={p.servicioId} />;
    case 'pedidos':
      return <PanelPedidos />;
    case 'pedido':
      return <PanelPedido key={p.id} id={p.id} />;
    case 'perfil':
      return <PanelPerfil />;
    case 'mi-local':
      return <PanelMiLocal />;
    case 'buscar':
      return <PanelBuscar pestana={p.pestana ?? 'servicios'} />;
    case 'arbitro':
      return <PanelArbitro />;
    case 'avisos':
      return <PanelAvisos />;
    case 'datos-curiosos':
      return <PanelDatosCuriosos barrio={p.barrio} />;
    case 'busqueda':
      return <PanelBusqueda key={p.id} id={p.id} />;
    case 'publicar-busqueda':
      return <PanelPublicarBusqueda barrio={p.barrio ?? villa} />;
  }
}
