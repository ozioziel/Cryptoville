import { describe, expect, it } from 'vitest';
import { APARIENCIA_POR_AVATAR, CATALOGO_PERSONA, aparienciaDeAvatar } from '@cryptoville/shared';
import { crearPersona } from './arte/persona';

describe('perfiles de todas las apariencias', () => {
  it('conserva los retratos frontales y genera ocho cuadros distintos por lado', () => {
    for (const a of Object.values(APARIENCIA_POR_AVATAR)) {
      expect(crearPersona(a)).toBe(crearPersona(a, { direccion: 'frente' }));
      for (const direccion of ['derecha', 'izquierda'] as const) {
        const cuadros = Array.from({ length: 8 }, (_, paso) => crearPersona(a, { direccion, paso }));
        expect(new Set(cuadros).size).toBe(8);
        for (const svg of cuadros) {
          expect(svg).not.toMatch(/NaN|undefined|Infinity/);
          expect(svg).toContain('viewBox="0 0 60 92"');
        }
      }
    }
  });
  it('cada accesorio y peinado conserva una representación propia de perfil', () => {
    const a = aparienciaDeAvatar(85);
    for (const campo of ['peinado', 'barba', 'gorro', 'lentes', 'objeto', 'arriba', 'abajo', 'zapatos'] as const) {
      const dibujos = CATALOGO_PERSONA[campo].map(({ id }) => crearPersona({ ...a, [campo]: id }, { direccion: 'derecha' }));
      expect(new Set(dibujos).size, campo).toBe(dibujos.length);
    }
  });
  it('mantiene el perfil izquierdo al reflejar juntas todas las capas', () => {
    const a = aparienciaDeAvatar(84);
    const derecha = crearPersona(a, { direccion: 'derecha', paso: 2 });
    const izquierda = crearPersona(a, { direccion: 'izquierda', paso: 2 });
    expect(izquierda).toBe(derecha.replace('transform="translate(0 0)"', 'transform="translate(60 0) scale(-1 1)"'));
  });
});
