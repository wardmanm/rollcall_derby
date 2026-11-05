import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { fontFaceRules } from '@rollcall/core-contract';
import { familiesUsedBy, themeToCss, type ThemeChanged } from '@rollcall/producer-contract';
import { ThemeScope } from './ThemeScope.tsx';

// Nothing comes in until its fonts have loaded, so a theme change must not flash text in a fallback font.

const fontsOf = (theme: ThemeChanged) => (theme ? familiesUsedBy(theme.tokens, theme.families) : []);
const needsLoad = (theme: ThemeChanged) => 'fonts' in document && fontsOf(theme).length > 0;

/**
 * Shows `children` inside the last theme whose fonts have loaded. The first theme holds `children` back until its fonts
 * are ready; a later theme leaves the old one on show until then. A font that fails to load, or a browser with no font
 * loading API, switches at once, so the theme is never stuck.
 */
export function ThemeWhenLoaded({ theme, children }: { theme: ThemeChanged; children: ReactNode }) {
  const [applied, setApplied] = useState<{ theme: ThemeChanged } | null>(() => (needsLoad(theme) ? null : { theme }));

  // A theme with no fonts to wait for is applied at once (React's pattern for state that follows a prop).
  const immediate = applied?.theme !== theme && !needsLoad(theme);
  if (immediate) {
    setApplied({ theme });
  }

  useEffect(() => {
    if (immediate || applied?.theme === theme) return undefined;
    let current = true;
    // Every face is loaded, not just the regular one: a heading in bold would otherwise swap in on air.
    const loads = fontsOf(theme).flatMap((family) =>
      family.faces.map((face) =>
        Promise.resolve()
          .then(() => document.fonts.load(`${face.style} ${face.weightMin} 1em "${family.name}"`))
          .catch(() => undefined),
      ),
    );
    void Promise.all(loads).then(() => {
      if (!current) return undefined;
      setApplied({ theme });
      return undefined;
    });
    return () => {
      current = false;
    };
  }, [theme, applied, immediate]);

  const shown = applied?.theme ?? null;
  const css = useMemo(() => (shown ? themeToCss(shown.tokens, shown.families) : null), [shown]);
  // A theme that isn't applied yet is waiting on its fonts, whose faces are added now so they can load.
  const pending = applied?.theme === theme ? null : theme;
  const pendingFaces = useMemo(() => (pending ? fontFaceRules(fontsOf(pending)) : ''), [pending]);
  return (
    <>
      {pendingFaces ? <style data-pending-fonts>{pendingFaces}</style> : null}
      {applied ? <ThemeScope css={css}>{children}</ThemeScope> : null}
    </>
  );
}
