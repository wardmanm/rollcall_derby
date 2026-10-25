import { useLayoutEffect, useRef, type ReactNode } from 'react';
import type { ThemeCss } from '@rollcall/producer-contract';

// Gives everything inside it a theme's CSS variables and font faces (ADR-0006), as themeToCss makes them. The OBS
// overlay and the theme editor's preview both use it, so they look the same. With no theme, the built-in look from
// theme-defaults.css shows through.
export function ThemeScope({ css, children }: { css: ThemeCss | null; children: ReactNode }) {
  const scope = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = scope.current;
    if (!element || !css) return undefined;
    const variables = Object.entries(css.variables);
    for (const [name, value] of variables) element.style.setProperty(name, value);
    return () => variables.forEach(([name]) => element.style.removeProperty(name));
  }, [css]);
  return (
    <div ref={scope} data-theme-scope>
      {css?.fontFaces ? <style>{css.fontFaces}</style> : null}
      {children}
    </div>
  );
}
