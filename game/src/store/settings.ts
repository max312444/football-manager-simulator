// 설정 (이 PC 브라우저에 저장). 게임 규칙 설정 (팝업 · 난이도) 은 진행 중인 게임의 w.settings 에도 넣는다
import { create } from 'zustand';
import type { Freq, GameSettings, PopupKind } from '../engine/gameSettings';
import type { World } from '../engine/types';
import { setNameStyle } from '../data/db';

export interface Settings {
  /** '계속' 이 어디서 멈출지: 내 경기마다 · 중요한 일만 (큰 경기 · 사건) · 이적시장 · 시즌 끝까지 */
  stopAt: 'match' | 'important' | 'window';
  /** 경기: 직접 지휘 (스쿼드 설정 → 경기 화면) · 결과만 */
  matchMode: 'manage' | 'result';
  /** 경기 화면 기본 속도 (0 보통 · 1 빠르게 · 2 매우 빠르게) */
  matchSpeed: 0 | 1 | 2;
  popups: Record<PopupKind, Freq>;
  patience: NonNullable<GameSettings['patience']>;
  rules: NonNullable<GameSettings['rules']>;
  transfers: NonNullable<GameSettings['transfers']>;
  /** 자동 저장: 진행할 때마다 · 1주 · 1달 · 안 함 */
  autosave: 'day' | 'week' | 'month' | 'off';
  /** 글자 크기 (화면 배율) */
  fontScale: 0.9 | 1 | 1.1 | 1.2;
  /** 선수 이름 표기 */
  names: 'full' | 'short';
}

export const DEFAULT_SETTINGS: Settings = {
  stopAt: 'match', matchMode: 'manage', matchSpeed: 0,
  popups: { press: 'normal', board: 'normal', scandal: 'normal', saga: 'normal' },
  patience: 'normal', rules: 'normal', transfers: 'normal',
  autosave: 'day', fontScale: 1, names: 'full',
};

const KEY = 'pitchboss.settings';
function read(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { ...DEFAULT_SETTINGS, ...s, popups: { ...DEFAULT_SETTINGS.popups, ...(s.popups ?? {}) } };
  } catch { return DEFAULT_SETTINGS; }
}

/** 화면에 바로 반영되는 것 (글자 크기 · 이름 표기) */
function apply(s: Settings) {
  try { document.documentElement.style.zoom = String(s.fontScale); } catch { /* 무시 */ }
  setNameStyle(s.names);
}

/** 게임 규칙 설정만 골라 세이브에 */
export const gameSettingsOf = (s: Settings): GameSettings => ({ popups: { ...s.popups }, patience: s.patience, rules: s.rules, transfers: s.transfers });
export function syncWorld(w: World | null, s = useSettings.getState().s) { if (w) w.settings = gameSettingsOf(s); }

export const useSettings = create<{ s: Settings; set(change: Partial<Settings>): void; reset(): void }>((setState, get) => ({
  s: read(),
  set(change) {
    const s = { ...get().s, ...change, popups: { ...get().s.popups, ...(change.popups ?? {}) } };
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 무시 */ }
    apply(s);
    setState({ s });
  },
  reset() {
    try { localStorage.removeItem(KEY); } catch { /* 무시 */ }
    apply(DEFAULT_SETTINGS);
    setState({ s: DEFAULT_SETTINGS });
  },
}));
apply(useSettings.getState().s);
