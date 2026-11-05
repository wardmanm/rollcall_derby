import { useMemo } from 'react';
import { themeToCss } from '@rollcall/producer-contract';
import { PlaceholderCard } from './components/PlaceholderCard.tsx';
import { IntroOverlay } from './IntroOverlay.tsx';
import { useGetLiveStateQuery } from './live.ts';
import { ThemeScope } from './ThemeScope.tsx';

// Hosts overlay components in the OBS output, feeding them props from live state, styled with the default theme.
// Shows nothing until the server has spoken, so a stream never shows an empty or broken card. An intro's address
// (`introId`) shows that intro; any other address shows the placeholder.
export function OverlayApp({ introId }: { introId: string | null }) {
  const { data } = useGetLiveStateQuery();
  const theme = data?.theme ?? null;
  const css = useMemo(() => (theme ? themeToCss(theme.tokens, theme.families) : null), [theme]);
  if (!data?.server) return null;
  if (introId !== null) return <IntroOverlay state={data.intro} theme={theme} />;
  return (
    <ThemeScope css={css}>
      <PlaceholderCard title={data.server.name} subtitle={`v${data.server.version}`} />
    </ThemeScope>
  );
}
