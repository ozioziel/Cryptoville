import { useEffect, useRef, useState } from 'react';
import { ProveedorSesion, useSesion } from './features/auth/sesion';
import { emitir, escuchar } from './game/EventBus';
import { PhaserGame } from './game/PhaserGame';
import { cargarConfig, type ConfigPublica } from './lib/config';
import { mensajeDeError } from './lib/api';
import { Avatar } from './ui/components/basicos';
import { Joystick } from './ui/components/Joystick';
import { Panel } from './ui/components/Panel';
import { ProveedorEstado, useEstado, type PanelAbierto } from './ui/estado';
import { PanelArbitro } from './ui/panels/PanelArbitro';
import { PanelAvisos } from './ui/panels/PanelAvisos';
import { PanelBienvenida } from './ui/panels/PanelBienvenida';
import { PanelBuscar } from './ui/panels/PanelBuscar';
import { PanelLote } from './ui/panels/PanelLote';
import { PanelMiLocal } from './ui/panels/PanelMiLocal';
import { PanelPedido } from './ui/panels/PanelPedido';
import { PanelPedidos } from './ui/panels/PanelPedidos';
import { PanelPerfil } from './ui/panels/PanelPerfil';
import { PanelServicio } from './ui/panels/PanelServicio';

const esTactil = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

export function App() {
  const [config, setConfig] = useState<ConfigPublica | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    cargarConfig().then(setConfig, (e) => setError(mensajeDeError(e)));
  }, []);

  if (error) {
    return (
      <div className="pantalla-error">
        <h1>Cryptoville</h1>
        <p>{error}</p>
        <button type="button" className="boton" onClick={() => location.reload()}>
          Reintentar
        </button>
      </div>
    );
  }
  if (!config) return <div className="pantalla-error">Cargando Cryptoville…</div>;
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
  const { panel, abrir, cerrar, atras, puedeVolver, locales, notificaciones, descartar, avisosSinLeer } = useEstado();
  const [loteCercano, setLoteCercano] = useState<number | null>(null);
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
  const avatarRef = useRef<number | null>(null);
  avatarRef.current = usuario?.avatar ?? null;
  useEffect(() => {
    const quitar = [
      escuchar('cerca-de-lote', setLoteCercano),
      escuchar('entrar-lote', (lote) => {
        const local = localesRef.current.find((l) => l.lote === lote);
        if (local) {
          interiorAbierto.current = true;
          emitir('abrir-interior', { nombre: local.nombre, avatarDueno: local.usuario.avatar });
        }
        abrir({ tipo: 'lote', lote });
      }),
      escuchar('salio-del-local', () => cerrar()),
      escuchar('pueblo-listo', () => {
        const ls = localesRef.current;
        emitir('locales', ls.map((l) => ({ lote: l.lote, nombre: l.nombre, color: l.color, avatarDueno: l.usuario.avatar })));
        if (avatarRef.current !== null) emitir('avatar', avatarRef.current);
      }),
    ];
    return () => quitar.forEach((f) => f());
  }, [abrir, cerrar]);

  useEffect(() => {
    if (usuario) emitir('avatar', usuario.avatar);
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

  return (
    <div className="app">
      <PhaserGame />
      <header className="barra">
        <button type="button" className="logo" onClick={() => abrir({ tipo: 'bienvenida' })}>
          Cryptoville
        </button>
        <nav className="barra-acciones">
          <button type="button" className="boton boton-barra" onClick={() => abrir({ tipo: 'buscar' })} aria-label="Buscar servicios">
            🔍<span className="solo-ancho"> Buscar</span>
          </button>
          {usuario ? (
            <>
              <button type="button" className="boton boton-barra" onClick={() => abrir({ tipo: 'pedidos' })}>
                📦<span className="solo-ancho"> Mis pedidos</span>
              </button>
              <button type="button" className="boton boton-barra" onClick={() => abrir({ tipo: 'avisos' })} aria-label={`Avisos: ${avisosSinLeer} sin leer`}>
                🔔{avisosSinLeer > 0 && <span className="contador">{avisosSinLeer}</span>}
              </button>
              <button type="button" className="boton boton-barra" onClick={() => abrir({ tipo: 'perfil' })} aria-label="Mi perfil">
                <Avatar frame={usuario.avatar} tamano={22} />
                <span className="solo-ancho"> {usuario.nombre}</span>
              </button>
            </>
          ) : (
            <button type="button" className="boton boton-primario boton-barra" onClick={() => abrir({ tipo: 'bienvenida' })}>
              Entrar
            </button>
          )}
        </nav>
      </header>

      {!panel && loteCercano !== null && (
        <button type="button" className="boton boton-primario boton-entrar" onClick={() => emitir('pedir-entrar')}>
          {locales.some((l) => l.lote === loteCercano) ? `Entrar a ${locales.find((l) => l.lote === loteCercano)?.nombre}` : 'Ver lote'}
          {!tactil && <kbd>E</kbd>}
        </button>
      )}
      {!panel && !tactil && <p className="ayuda-controles">Camina con las flechas o WASD · entra con E</p>}
      {tactil && !panel && <Joystick />}

      {panel && (
        <Panel titulo={tituloPanel(panel, locales)} onCerrar={panel.tipo === 'bienvenida' ? cerrarBienvenida : cerrar} onAtras={puedeVolver ? atras : undefined}>
          {contenidoPanel(panel, cerrarBienvenida)}
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
              }}
            >
              {n.texto}
            </button>
            <button type="button" className="boton-icono" onClick={() => descartar(n.id)} aria-label="Descartar">
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function tituloPanel(p: PanelAbierto, locales: { lote: number; nombre: string }[]): string {
  switch (p.tipo) {
    case 'bienvenida':
      return 'Bienvenido a Cryptoville';
    case 'lote':
      return locales.find((l) => l.lote === p.lote)?.nombre ?? `Lote ${p.lote}`;
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
      return 'Buscar servicios';
    case 'arbitro':
      return 'Panel del árbitro';
    case 'avisos':
      return 'Avisos';
  }
}

function contenidoPanel(p: PanelAbierto, cerrarBienvenida: () => void) {
  switch (p.tipo) {
    case 'bienvenida':
      return <PanelBienvenida onListo={cerrarBienvenida} />;
    case 'lote':
      return <PanelLote lote={p.lote} />;
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
      return <PanelBuscar />;
    case 'arbitro':
      return <PanelArbitro />;
    case 'avisos':
      return <PanelAvisos />;
  }
}
