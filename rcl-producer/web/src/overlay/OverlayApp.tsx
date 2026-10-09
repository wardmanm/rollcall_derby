import { PlaceholderCard } from './components/PlaceholderCard.tsx';
import { useGetLiveStateQuery } from './live.ts';

// Hosts overlay components in the OBS output, feeding them props from live state.
// Shows nothing until the server has spoken, so a stream never shows an empty or broken card.
export function OverlayApp() {
  const { data } = useGetLiveStateQuery();
  if (!data?.server) return null;
  return <PlaceholderCard title={data.server.name} subtitle={`v${data.server.version}`} />;
}
