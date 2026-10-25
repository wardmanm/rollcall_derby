import { useMemo } from 'react';
import { themeToCss } from '@rollcall/producer-contract';
import { PlaceholderCard } from './components/PlaceholderCard.tsx';
import { useGetLiveStateQuery } from './live.ts';
import { ThemeScope } from './ThemeScope.tsx';

// Hosts overlay components in the OBS output, feeding them props from live state, styled with the default theme.
// Shows nothing until the server has spoken, so a stream never shows an empty or broken card.
export function OverlayApp() {
  const { data } = useGetLiveStateQuery();
  const theme = data?.theme ?? null;
  const css = useMemo(() => (theme ? themeToCss(theme.tokens, theme.families) : null), [theme]);
  if (!data?.server) return null;
  return (
    <ThemeScope css={css}>
      <PlaceholderCard title={data.server.name} subtitle={`v${data.server.version}`} />
    </ThemeScope>
  );
}
