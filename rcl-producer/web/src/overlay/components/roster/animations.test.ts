import { describe, expect, it } from 'vitest';
import { EXIT_ANIMATIONS } from './animations.ts';

describe('EXIT_ANIMATIONS', () => {
  it('holds the four exits, by the names the CSS module gives them', () => {
    expect(EXIT_ANIMATIONS.size).toBe(4);
    for (const name of EXIT_ANIMATIONS) expect(name).not.toBe('');
  });
});
