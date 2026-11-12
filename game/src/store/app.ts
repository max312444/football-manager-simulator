// 화면 전환 (게임 진행 상태는 store/game.ts)
import { create } from 'zustand';
import type { SearchPreset } from '../engine/analysis';

export type Screen = 'title' | 'newgame' | 'hub';
export type HubTab = 'home' | 'inbox' | 'news' | 'squad' | 'tactics' | 'schedule' | 'table' | 'transfers' | 'finance' | 'club';

interface AppState {
  screen: Screen;
  tab: HubTab;
  go(screen: Screen): void;
  setTab(tab: HubTab): void;
  /** 휴대폰 · 좁은 화면: 서랍 메뉴 열림 */
  drawer: boolean;
  setDrawer(open: boolean): void;
  /** 분석 → 이적 화면 검색 조건 */
  transferPreset: SearchPreset | null;
  openTransfers(preset: SearchPreset | null): void;
  /** 검색 등에서 연 선수 정보 · 구단 창 */
  profile: string | null;
  openProfile(id: string | null): void;
  clubView: string | null;
  openClub(id: string | null): void;
  /** 순위 화면에서 보여줄 리그 */
  tableLeague: string | null;
  openTable(league: string): void;
}

export const useApp = create<AppState>((set) => ({
  screen: 'title',
  tab: 'home',
  go: (screen) => set({ screen }),
  setTab: (tab) => set({ tab, drawer: false }),
  drawer: false,
  setDrawer: (drawer) => set({ drawer }),
  transferPreset: null,
  openTransfers: (preset) => set({ transferPreset: preset, tab: 'transfers' }),
  profile: null,
  openProfile: (id) => set({ profile: id }),
  clubView: null,
  openClub: (id) => set({ clubView: id }),
  tableLeague: null,
  openTable: (league) => set({ tableLeague: league, tab: 'table', clubView: null, profile: null }),
}));

// 개발 중 변경 시 페이지 전체 새로 고침 (상태 어긋남 방지)
if (import.meta.hot) import.meta.hot.accept(() => location.reload());
