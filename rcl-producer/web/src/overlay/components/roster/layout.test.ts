import { describe, expect, it } from 'vitest';
import { anchor, cardWidth } from './layout.ts';

describe('cardWidth', () => {
  it('caps at the widest card', () => {
    expect(cardWidth(1824, 1)).toBe(420);
    expect(cardWidth(1824, 4)).toBe(420);
  });

  it('shares the box between the slots, less the gaps', () => {
    expect(cardWidth(1824, 10)).toBe(160);
    expect(cardWidth(1824, 20)).toBe(68);
  });
});

describe('anchor', () => {
  it('puts the horizontal part on justifyContent and the vertical on alignItems', () => {
    expect(anchor('bottom-center')).toEqual({ justifyContent: 'center', alignItems: 'flex-end' });
    expect(anchor('top-left')).toEqual({ justifyContent: 'flex-start', alignItems: 'flex-start' });
    expect(anchor('middle-right')).toEqual({ justifyContent: 'flex-end', alignItems: 'center' });
  });
});
