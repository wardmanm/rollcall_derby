import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_PLACEMENT, DEFAULT_ROSTER_OPTIONS } from '@rollcall/producer-contract';
import { IntroPreview } from './IntroPreview.tsx';

afterEach(() => vi.unstubAllGlobals());

// jsdom has no layout, so this stands in for the browser measuring the preview's frame at `width` pixels.
function frameMeasuredAt(width: number) {
  const height = (width * 9) / 16;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }
      observe(target: Element) {
        const size = [{ inlineSize: width, blockSize: height }];
        const rect = { x: 0, y: 0, top: 0, left: 0, width, height, right: width, bottom: height };
        const entry = { target, borderBoxSize: size, contentBoxSize: size, contentRect: rect };
        this.callback([entry as unknown as ResizeObserverEntry], this);
      }
      unobserve() {}
      disconnect() {}
    },
  );
}

describe('the intro preview', () => {
  it('scales the 1920×1080 canvas to the width of its frame, so all of it shows', async () => {
    frameMeasuredAt(300);
    render(
      <IntroPreview team={undefined} options={DEFAULT_ROSTER_OPTIONS} placement={DEFAULT_PLACEMENT} theme={null} />,
    );
    await waitFor(() => expect(screen.getByTestId('overlay-canvas').style.transform).toBe('scale(0.15625)'));
  });
});
