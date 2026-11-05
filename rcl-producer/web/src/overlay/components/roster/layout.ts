import type { RosterSpot } from '@rollcall/producer-contract';

// The overlay is drawn on a fixed 1920x1080 canvas that OverlayCanvas scales to the browser source.
export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;
export const MAX_CARD_WIDTH = 420;
export const CARD_GAP = 24;

/** The width of one card when `slots` of them (and the gaps between) share a box `boxWidth` wide. */
export function cardWidth(boxWidth: number, slots: number): number {
  return Math.min(MAX_CARD_WIDTH, Math.floor((boxWidth - CARD_GAP * (slots - 1)) / slots));
}

type Edge = 'flex-start' | 'center' | 'flex-end';

const HORIZONTAL: Record<string, Edge> = { left: 'flex-start', center: 'center', right: 'flex-end' };
const VERTICAL: Record<string, Edge> = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };

/** Flex alignment that puts a row in its spot on the canvas. */
export function anchor(spot: RosterSpot): { justifyContent: Edge; alignItems: Edge } {
  const [vertical = 'bottom', horizontal = 'center'] = spot.split('-');
  return {
    justifyContent: HORIZONTAL[horizontal] ?? 'center',
    alignItems: VERTICAL[vertical] ?? 'flex-end',
  };
}
