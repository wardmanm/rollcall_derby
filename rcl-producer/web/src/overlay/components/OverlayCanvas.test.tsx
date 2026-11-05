import { afterEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { OverlayCanvas } from './OverlayCanvas.tsx';

function scaleOf(): number {
  const transform = screen.getByTestId('overlay-canvas').style.transform;
  return Number(/scale\(([\d.]+)\)/.exec(transform)?.[1]);
}

function resizeTo(width: number, height: number) {
  act(() => {
    window.innerWidth = width;
    window.innerHeight = height;
    window.dispatchEvent(new Event('resize'));
  });
}

describe('OverlayCanvas', () => {
  afterEach(() => resizeTo(1024, 768));

  it('scales to fit the window and follows resizes', () => {
    resizeTo(1280, 720);
    render(<OverlayCanvas>hi</OverlayCanvas>);
    expect(scaleOf()).toBeCloseTo(2 / 3, 5);
    resizeTo(1920, 1080);
    expect(scaleOf()).toBe(1);
  });

  it('uses the scale it is given', () => {
    render(<OverlayCanvas scale={0.25}>hi</OverlayCanvas>);
    expect(scaleOf()).toBe(0.25);
    expect(screen.getByText('hi')).toBeTruthy();
  });
});
