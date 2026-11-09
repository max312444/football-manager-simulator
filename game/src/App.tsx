import { useApp } from './store/app';
import { useGame } from './store/game';
import { TitleScreen } from './ui/screens/TitleScreen';
import { NewGameScreen } from './ui/screens/NewGameScreen';
import { HubScreen } from './ui/screens/HubScreen';
import { MatchScreen } from './ui/screens/MatchScreen';
import { CrestGallery } from './ui/screens/CrestGallery';
import { useEffect } from 'react';

export function App() {
  const screen = useApp((s) => s.screen);
  const hasWorld = useGame((s) => !!s.world);
  const inMatch = useGame((s) => !!s.match);
  const load = useGame((s) => s.load);
  const go = useApp((s) => s.go);
  // 데이터 전환 뒤 새로 고침된 경우: 이어서 불러오기
  useEffect(() => {
    let slot: string | null = null;
    try { slot = sessionStorage.getItem('pitchboss.resume'); sessionStorage.removeItem('pitchboss.resume'); } catch { /* 무시 */ }
    if (slot) void load(slot).then((ok) => ok && go('hub'));
  }, [load, go]);

  if (import.meta.env.DEV && location.search.includes('crests')) return <CrestGallery />;
  if (screen === 'newgame') return <NewGameScreen />;
  if (screen === 'hub' && hasWorld) return inMatch ? <MatchScreen /> : <HubScreen />;
  return <TitleScreen />;
}
