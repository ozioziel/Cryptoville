import { useRef, useState, type PointerEvent } from 'react';
import { emitir } from '../../game/EventBus';

const RADIO = 44;

/** Joystick táctil para caminar por el pueblo en el celular. */
export function Joystick() {
  const base = useRef<HTMLDivElement>(null);
  const [perilla, setPerilla] = useState({ x: 0, y: 0 });
  const activo = useRef<number | null>(null);

  const mover = (e: PointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    let x = e.clientX - (r.left + r.width / 2);
    let y = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(x, y);
    if (d > RADIO) {
      x = (x / d) * RADIO;
      y = (y / d) * RADIO;
    }
    setPerilla({ x, y });
    emitir('joystick', x / RADIO, y / RADIO);
  };
  const soltar = () => {
    activo.current = null;
    setPerilla({ x: 0, y: 0 });
    emitir('joystick', 0, 0);
  };

  return (
    <div
      ref={base}
      className="joystick"
      aria-label="Joystick para caminar"
      onPointerDown={(e) => {
        activo.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        mover(e);
      }}
      onPointerMove={(e) => activo.current === e.pointerId && mover(e)}
      onPointerUp={soltar}
      onPointerCancel={soltar}
    >
      <div className="joystick-perilla" style={{ transform: `translate(${perilla.x}px, ${perilla.y}px)` }} />
    </div>
  );
}
