// 화면 전환 (게임 진행 상태는 store/game.ts)
import { create } from 'zustand';

export type Screen = 'title' | 'newgame' | 'hub';
export type HubTab = 'home' | 'inbox' | 'squad' | 'tactics' | 'schedule' | 'table' | 'transfers' | 'finance' | 'club';

interface AppState {
  screen: Screen;
  tab: HubTab;
  go(screen: Screen): void;
  setTab(tab: HubTab): void;
}

export const useApp = create<AppState>((set) => ({
  screen: 'title',
  tab: 'home',
  go: (screen) => set({ screen }),
  setTab: (tab) => set({ tab }),
}));

// 개발 중 변경 시 페이지 전체 새로 고침 (상태 어긋남 방지)
if (import.meta.hot) import.meta.hot.accept(() => location.reload());
