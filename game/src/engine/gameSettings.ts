// 게임 규칙에 영향을 주는 설정 (세이브의 w.settings, 화면 설정에서 바꾸면 진행 중인 게임에도 반영)
//  - 팝업 빈도: 기자회견 · 이사회 이벤트 · 선수 논란 · 선수 언론 플레이 — 끄기 · 드물게 · 보통 · 자주
//    끄기 = 일은 그대로 일어나지만 무난한 선택으로 자동 처리하고 결과만 받은편지함에 (autoResolve.ts)
//  - 난이도: 이사회 인내심 (경질 엄격도) · 재정 규정 엄격도 (내 구단 한도) · 이적 협상 (내 구단이 살 때 요구 금액 · 선수 마음)
//  이 파일은 다른 엔진 파일을 불러오지 않는다 (순환 방지)
import type { World } from './types';

export type Freq = 'off' | 'rare' | 'normal' | 'often';
export type PopupKind = 'press' | 'board' | 'scandal' | 'saga';
export interface GameSettings {
  popups?: Partial<Record<PopupKind, Freq>>;
  patience?: 'lenient' | 'normal' | 'strict';
  rules?: 'relaxed' | 'normal' | 'strict';
  transfers?: 'easy' | 'normal' | 'hard';
}

const FACTOR: Record<Freq, number> = { off: 1, rare: 0.5, normal: 1, often: 1.6 };
/** 팝업이 생기는 확률 배율 */
export const freqOf = (w: World, k: PopupKind) => FACTOR[w.settings?.popups?.[k] ?? 'normal'];
/** 팝업 끔 (자동 처리) */
export const popupOff = (w: World, k: PopupKind) => w.settings?.popups?.[k] === 'off';

/** 이사회 인내심: 시즌 중 경질 기준 · 시즌 끝 교체 기준 · 신뢰도 하락 배율 */
export function patienceOf(w: World) {
  return ({ lenient: { mid: 8, end: 15, drop: 0.7 }, normal: { mid: 15, end: 25, drop: 1 }, strict: { mid: 22, end: 35, drop: 1.3 } } as const)[w.settings?.patience ?? 'normal'];
}
/** 재정 규정 한도 배율 (내 구단) */
export const rulesFactor = (w: World) => ({ relaxed: 1.15, normal: 1, strict: 0.9 })[w.settings?.rules ?? 'normal'];
/** 이적 협상 (내 구단이 살 때): 파는 구단 요구 금액 배율 · 선수 마음 보정 */
export const transferFactor = (w: World) => ({ easy: { ask: 0.9, will: 0.5 }, normal: { ask: 1, will: 0 }, hard: { ask: 1.15, will: -0.5 } })[w.settings?.transfers ?? 'normal'];
