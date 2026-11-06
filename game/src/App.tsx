import { useApp } from './store/app';
import { useGame } from './store/game';
import { TitleScreen } from './ui/screens/TitleScreen';
import { NewGameScreen } from './ui/screens/NewGameScreen';
import { HubScreen } from './ui/screens/HubScreen';
import { MatchScreen } from './ui/screens/MatchScreen';
import { CrestGallery } from './ui/screens/CrestGallery';

export function App() {
  const screen = useApp((s) => s.screen);
  const hasWorld = useGame((s) => !!s.world);
  const inMatch = useGame((s) => !!s.match);

  if (import.meta.env.DEV && location.search.includes('crests')) return <CrestGallery />;
  if (screen === 'newgame') return <NewGameScreen />;
  if (screen === 'hub' && hasWorld) return inMatch ? <MatchScreen /> : <HubScreen />;
  return <TitleScreen />;
}
