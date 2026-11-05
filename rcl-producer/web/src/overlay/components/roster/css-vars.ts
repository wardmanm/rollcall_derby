import type { CSSProperties } from 'react';

/** Custom properties as an inline style (React's types only know the standard properties). */
export function cssVars(vars: Record<string, string | number>): CSSProperties {
  return Object.assign({}, vars);
}
