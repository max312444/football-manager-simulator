// 선수 논란 (게임이 무작위로 만드는 가벼운 논란 — 실제 사건이 아님, 범죄 · 심각한 사생활은 넣지 않음)
//  종류: 밤 외출 사진 · SNS 게시물 · 훈련 지각 · 동료와 언쟁 · 감독 비판 인터뷰 · 교체 때 불만 표시
//  - 매달 8일 · 23일, 내 구단 선수: 기질 · 프로의식이 낮을수록 잘 터짐 · 20일에 한 번까지 · 하나씩
//  - 터지면 바로 조금 영향 (팬 여론 · 팀 분위기 · 신뢰도), 대응에 따라 더 바뀜: 감싸기 · 내부 징계 · 공개 비판 · 무시 (+ 동료 언쟁은 중재)
//  - 논란이 쌓인 선수는 사가 (이적 요청 · 연봉 요구) 를 일으키기 쉬워짐 (saga.ts) · 기자회견에서 그 일을 묻는다 (press.ts)
import { freqOf } from './gameSettings';
import type { GameEvent, PlayerState, World } from './types';
import type { Rng } from './rng';
import { overall } from './ratings';
import { ensureManager } from './manager';
import { addRelation } from './board';
import { addFanMood } from './boardEvents';

export type ScandalKind = 'nightlife' | 'social' | 'late' | 'teammate' | 'criticize' | 'gesture';
export interface Scandal { player: string; kind: ScandalKind; date: string; other?: string }
export type ScandalAction = 'defend' | 'fine' | 'criticize' | 'ignore' | 'mediate';

export const SCANDAL_KO: Record<ScandalKind, string> = {
  nightlife: '경기 이틀 전 새벽 클럽에서 찍힌 사진이 퍼졌습니다',
  social: 'SNS에 올린 게시물이 팬들의 비난을 받고 있습니다',
  late: '훈련에 여러 번 지각했다는 보도가 나왔습니다',
  teammate: '훈련장에서 동료와 크게 언쟁했다는 보도가 나왔습니다',
  criticize: '인터뷰에서 감독의 전술과 기용을 공개적으로 비판했습니다',
  gesture: '교체되면서 벤치를 향해 불만을 드러냈습니다',
};
export const SCANDAL_TITLE: Record<ScandalKind, string> = {
  nightlife: '새벽 클럽 사진', social: 'SNS 게시물 논란', late: '훈련 지각', teammate: '동료와 언쟁', criticize: '감독 공개 비판', gesture: '교체 때 불만 표시',
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 864e5;
const teamMorale = (w: World, d: number, except: string[] = []) => { for (const id of w.clubs[w.userClubId].squad) if (!except.includes(id)) { const p = w.players[id]; p.morale = clamp(p.morale + d, 0, 100); } };

/** 하루: 논란 터짐 (내 구단 선수) */
export function scandalDay(w: World, rng: Rng): GameEvent[] {
  const day = w.date.slice(8);
  const mon = +w.date.slice(5, 7);
  if ((day !== '08' && day !== '23') || mon === 6 || mon === 7) return [];   // 시즌 중 (8~5월) 에만
  if (w.scandalPrompt || (w.lastScandal && days(w.lastScandal, w.date) < 20)) return [];
  const squad = w.clubs[w.userClubId].squad.map((id) => w.players[id]);
  for (const p of rng.next() < 0.5 ? squad : [...squad].reverse()) {
    // 위험도: 기질 (침착함) · 프로의식이 낮을수록, 논란 전력이 있으면 조금 더
    const risk = (20 - p.hidden.temperament) / 10 + (20 - p.hidden.professionalism) / 10 + (p.scandals ?? 0) * 0.2;   // 0 ~ 4
    if (!rng.chance(0.0009 * risk * risk * freqOf(w, 'scandal'))) continue;
    const kinds: ScandalKind[] = ['nightlife', 'social', 'late', 'teammate', 'criticize', 'gesture'];
    const kind = rng.pick(kinds.filter((k) => k !== 'criticize' || p.morale < 50 || p.unhappy));
    const other = kind === 'teammate' ? rng.pick(squad.filter((q) => q.id !== p.id)).id : undefined;
    const s: Scandal = { player: p.id, kind, date: w.date, other };
    // 터지자마자 영향
    if (kind === 'nightlife' || kind === 'social' || kind === 'gesture') addFanMood(w, -2);
    if (kind === 'late') teamMorale(w, -1, [p.id]);
    if (kind === 'teammate' && other) { p.morale = clamp(p.morale - 5, 0, 100); const o = w.players[other]; o.morale = clamp(o.morale - 5, 0, 100); }
    if (kind === 'criticize') { const m = ensureManager(w); m.confidence = clamp(m.confidence - 2, 0, 100); }
    p.scandals = (p.scandals ?? 0) + 1;
    p.lastScandal = { kind, date: w.date };
    w.scandalPrompt = s;
    w.lastScandal = w.date;
    return [{ type: 'scandal', date: w.date, player: p.id, kind, other }];
  }
  return [];
}

/** 대응 */
export function scandalRespond(w: World, action: ScandalAction, rng: Rng): { text: string; events: GameEvent[] } {
  const s = w.scandalPrompt;
  if (!s) return { text: '', events: [] };
  w.scandalPrompt = undefined;
  const p = w.players[s.player];
  if (!p) return { text: '', events: [] };
  const say = (text: string) => ({ text, events: [{ type: 'info', date: w.date, text } as GameEvent] });
  const serious = s.kind === 'nightlife' || s.kind === 'gesture' || s.kind === 'criticize';
  switch (action) {
    case 'defend':
      p.morale = clamp(p.morale + 6, 0, 100); p.loyalty = clamp(p.loyalty + 5, 0, 100);
      if (serious) { addFanMood(w, -2); addRelation(w, -1); }
      return say('선수를 감쌌습니다 · 선수는 고마워하지만 비판 여론도 있습니다');
    case 'fine':
      p.morale = clamp(p.morale - 8, 0, 100); teamMorale(w, 1, [p.id]); addRelation(w, 2);
      return say('내부 징계 (벌금) · 이사회는 단호한 대처를 반깁니다');
    case 'criticize':
      p.morale = clamp(p.morale - 15, 0, 100); p.loyalty = clamp(p.loyalty - 15, 0, 100); addFanMood(w, 3);
      return say('선수를 공개 비판했습니다 · 팬들은 지지하지만 선수와의 관계가 틀어졌습니다');
    case 'mediate': {
      const o = s.other ? w.players[s.other] : null;
      p.morale = clamp(p.morale + 4, 0, 100); if (o) o.morale = clamp(o.morale + 4, 0, 100);
      return say('두 선수를 불러 화해시켰습니다');
    }
    case 'ignore':
      if (rng.chance(0.4)) { addFanMood(w, -3); addRelation(w, -2); return say('논란을 무시했더니 언론이 더 크게 다뤘습니다'); }
      return say('논란을 무시했습니다 · 다행히 조용히 지나갔습니다');
  }
  return { text: '', events: [] };
}

/** 최근 (14일 안) 논란이 있었던 내 선수 (기자회견 질문용) */
export const recentScandal = (w: World): PlayerState | null =>
  w.clubs[w.userClubId].squad.map((id) => w.players[id]).filter((p) => p.lastScandal && days(p.lastScandal.date, w.date) <= 14).sort((a, b) => overall(b) - overall(a))[0] ?? null;
