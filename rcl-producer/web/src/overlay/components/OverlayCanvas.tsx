import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from './roster/layout.ts';
import classes from './OverlayCanvas.module.css';

export interface OverlayCanvasProps {
  children: ReactNode;
  /** Fixed scale, for previews. Without it the canvas fits the window. */
  scale?: number;
}

function fitScale(): number {
  return Math.min(window.innerWidth / CANVAS_WIDTH, window.innerHeight / CANVAS_HEIGHT);
}

// A transparent 1920x1080 canvas, scaled from its top left and centered in the window, so everything inside it is
// laid out in canvas pixels whatever size the OBS browser source is.
export function OverlayCanvas({ children, scale }: OverlayCanvasProps) {
  const [fit, setFit] = useState(fitScale);
  useEffect(() => {
    const onResize = () => setFit(fitScale());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const s = scale ?? fit;

  return (
    <div className={classes.window}>
      <div
        className={classes.canvas}
        data-testid="overlay-canvas"
        style={{
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          transform: `scale(${s})`,
          marginLeft: -(CANVAS_WIDTH * s) / 2,
          marginTop: -(CANVAS_HEIGHT * s) / 2,
        }}
      >
        {children}
      </div>
    </div>
  );
}
