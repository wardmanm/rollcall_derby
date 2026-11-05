import { describe, expect, it } from 'vitest';
import { introIdFromPath } from './intro-path.ts';

describe('introIdFromPath', () => {
  it('finds the intro id in the address', () => {
    expect(introIdFromPath('/producer/overlay/intros/abc')).toBe('abc');
    expect(introIdFromPath('/producer/overlay/intros/abc/')).toBe('abc');
  });

  it('decodes the id', () => {
    expect(introIdFromPath('/producer/overlay/intros/a%20b')).toBe('a b');
  });

  it('gives null for any other address', () => {
    expect(introIdFromPath('/producer/overlay')).toBeNull();
    expect(introIdFromPath('/producer/overlay/some-output-token')).toBeNull();
    expect(introIdFromPath('/producer/overlay/intros/')).toBeNull();
    expect(introIdFromPath('/producer/overlay/intros/a/b')).toBeNull();
  });

  it('gives null for an id that is not valid encoding', () => {
    expect(introIdFromPath('/producer/overlay/intros/%E0%A4%A')).toBeNull();
  });
});
