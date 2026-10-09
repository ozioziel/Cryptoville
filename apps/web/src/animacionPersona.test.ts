import { describe, expect, it, vi } from 'vitest';
import { aparienciaDeAvatar } from '@cryptoville/shared';
import type Phaser from 'phaser';
import { asegurarPersona, cuadroPersona, rumboPersona } from './game/animacionPersona';
import { asegurarTextura } from './game/texturas';

vi.mock('./game/texturas', () => ({ asegurarTextura: vi.fn().mockResolvedValue(true) }));

describe('selección de cuadros de marcha', () => {
  it('elige el eje dominante y conserva la orientación al detenerse', () => {
    expect(rumboPersona(-1, .5, 'frente')).toBe('izquierda');
    expect(rumboPersona(1, .5, 'izquierda')).toBe('derecha');
    expect(rumboPersona(.1, -1, 'derecha')).toBe('espalda');
    expect(rumboPersona(0, 0, 'izquierda')).toBe('izquierda');
  });
  it('completa el ciclo, vuelve a reposo y tolera tiempo negativo', () => {
    expect(new Set(Array.from({ length: 8 }, (_, i) => cuadroPersona('derecha', true, i * 90))).size).toBe(8);
    expect(cuadroPersona('derecha', true, 720)).toBe('derecha-1');
    expect(cuadroPersona('izquierda', false, 450)).toBe('izquierda-0');
    expect(cuadroPersona('derecha', true, -1)).toBe('derecha-1');
  });
});

describe('atlas de personas', () => {
  it('mantiene el tamaño original en reposo y registra 28 cuadros sin solaparse', async () => {
    const frames = new Map<string, number[]>();
    const setSize = vi.fn();
    const texture = { has: (name: string) => frames.has(name), add: (name: string, ...rect: number[]) => frames.set(name, rect), get: () => ({ setSize }) };
    const scene = { textures: { exists: () => true, get: () => texture } } as unknown as Phaser.Scene;
    expect(await asegurarPersona(scene, 'persona-test', aparienciaDeAvatar(85), 46, 70, 2)).toBe(true);
    expect(frames.size).toBe(28);
    expect(new Set([...frames.values()].map((r) => r.join(','))).size).toBe(28);
    expect(setSize).toHaveBeenCalledWith(92, 140, 0, 0);
    for (const frame of frames.values()) expect(frame.slice(3)).toEqual([92, 140]);
    await asegurarPersona(scene, 'persona-test', aparienciaDeAvatar(85), 46, 70, 2);
    expect(setSize).toHaveBeenCalledTimes(1);
  });
  it('no registra cuadros si la textura se liberó mientras se dibujaba', async () => {
    const get = vi.fn();
    const scene = { textures: { exists: () => false, get } } as unknown as Phaser.Scene;
    expect(await asegurarPersona(scene, 'liberada', aparienciaDeAvatar(85), 46, 70, 1)).toBe(false);
    expect(get).not.toHaveBeenCalled();
    expect(asegurarTextura).toHaveBeenCalled();
  });
});
