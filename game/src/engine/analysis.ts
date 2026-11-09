// 구단 분석: 포지션별 강점 · 약점 · 뎁스 · 노쇠화 · 계약 → 영입이 필요한 포지션 순위와 요약 문장
// (게임 데이터로 계산하는 규칙 기반 분석)
import type { Position } from '../data/types';
import type { PlayerState, World } from './types';
import { FORMATIONS } from './squad';
import { slotRating, overall } from './ratings';
import { ageOn } from './condition';
import { yearsLeft } from './transfer';
import { sortTable } from './standings';

export interface Unit {
  key: 'GK' | 'CB' | 'FB' | 'CM' | 'AW' | 'ST';
  label: string;
  /** 이 묶음 대표 자리 (자리 적합 능력 계산용) */
  slot: Position;
  group: 'GK' | 'DF' | 'MF' | 'FW';
  members: Position[];
}
export const UNITS: Unit[] = [
  { key: 'GK', label: '골키퍼', slot: 'GK', group: 'GK', members: ['GK'] },
  { key: 'CB', label: '센터백', slot: 'CB', group: 'DF', members: ['CB'] },
  { key: 'FB', label: '풀백', slot: 'RB', group: 'DF', members: ['LB', 'RB', 'LWB', 'RWB'] },
  { key: 'CM', label: '중앙 미드필더', slot: 'CM', group: 'MF', members: ['DM', 'CM'] },
  { key: 'AW', label: '공격형 · 측면', slot: 'AM', group: 'MF', members: ['AM', 'LM', 'RM', 'LW', 'RW'] },
  { key: 'ST', label: '스트라이커', slot: 'ST', group: 'FW', members: ['ST'] },
];

export interface UnitReport {
  unit: Unit;
  need: number;            // 포메이션상 주전 수
  starters: PlayerState[];
  starterAvg: number;
  benchmark: number;       // 리그 상위 4팀 같은 묶음 주전 평균
  gap: number;             // starterAvg - benchmark
  depth: number;           // 주전 수준(-6 이내) 후보 수
  aging: number;           // 31세 이상 주전 수
  expiring: number;        // 1년 안에 계약 끝나는 주전 수
  urgency: number;         // 영입 시급도 (높을수록 급함)
  verdict: 'strong' | 'ok' | 'weak';
  notes: string[];
}

/** 포메이션에서 묶음별 주전 수 */
function needOf(formation: string, u: Unit): number {
  const slots = FORMATIONS[formation] ?? FORMATIONS['4-4-2'];
  const n = slots.filter((s) => u.members.includes(s)).length;
  return Math.max(u.key === 'GK' ? 1 : 1, n);
}

function unitStarters(w: World, clubId: string, u: Unit, need: number) {
  const ps = w.clubs[clubId].squad.map((id) => w.players[id]);
  const ranked = ps.filter((p) => u.members.includes(p.pos)).sort((a, b) => slotRating(b, u.slot) - slotRating(a, u.slot));
  return { starters: ranked.slice(0, need), rest: ranked.slice(need) };
}
/** 한국어 조사: 받침 있으면 a, 없으면 b (예: 이/가, 과/와) */
export function josa(word: string, a: string, b: string): string {
  const ch = word.trim().slice(-1);
  const c = ch.charCodeAt(0) - 0xac00;
  const has = c >= 0 && c < 11172 ? c % 28 !== 0 : /[136780lmnr]$/i.test(ch);
  return word + (has ? a : b);
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function analyzeClub(w: World, clubId: string): { units: UnitReport[]; summary: string; priorities: UnitReport[] } {
  const club = w.clubs[clubId];
  const comp = w.competitions[club.league];
  // 비교 기준: 전력 순위가 바로 위인 3팀 ("한 단계 올라가려면 무엇이 필요한가"), 1위 팀은 바로 아래 3팀
  const last = w.history.filter((h) => h.league === club.league).at(-1);
  const strengthOf = (c: string) => avg(w.clubs[c].squad.map((id) => overall(w.players[id])).sort((a, b) => b - a).slice(0, 11));
  const ranked = Object.keys(comp?.table ?? {}).filter((c) => w.clubs[c]).sort((a, b) => strengthOf(b) - strengthOf(a));
  const me = ranked.indexOf(clubId);
  const peers = me <= 0 ? ranked.slice(1, 4) : ranked.slice(Math.max(0, me - 3), me);

  const units = UNITS.map((u): UnitReport => {
    const need = needOf(club.tactics.formation, u);
    const { starters, rest } = unitStarters(w, clubId, u, need);
    const starterAvg = avg(starters.map((p) => slotRating(p, u.slot)));
    const benchmark = avg(peers.map((c) => avg(unitStarters(w, c, u, needOf(w.clubs[c].tactics.formation, u)).starters.map((p) => slotRating(p, u.slot))))) || starterAvg;
    const gap = starterAvg - benchmark;
    const depth = rest.filter((p) => slotRating(p, u.slot) >= starterAvg - 6).length;
    const aging = starters.filter((p) => ageOn(p.birth, w.date) >= 31).length;
    const expiring = starters.filter((p) => yearsLeft(p, w.date) < 1).length;
    const missing = Math.max(0, need - starters.length);

    let urgency = Math.max(0, -gap) * 1.2 + missing * 6 + (depth === 0 ? 2.5 : 0) + aging * 1.5 + expiring * 1;
    if (gap > 2) urgency -= 2;
    const verdict = gap >= 2 && missing === 0 ? 'strong' : gap <= -3 || missing > 0 || urgency >= 6 ? 'weak' : 'ok';

    const notes: string[] = [];
    if (missing) notes.push(`주전 자리에 비해 선수가 ${missing}명 모자람`);
    if (gap <= -3) notes.push(`한 단계 위 팀들보다 주전 수준이 ${Math.round(-gap)} 낮음`);
    else if (gap >= 2) notes.push(`비교 팀들보다 ${Math.round(gap)} 높은 강점`);
    if (depth === 0 && need > 0) notes.push('주전이 빠지면 대신할 비슷한 수준의 선수가 없음');
    if (aging) notes.push(`주전 ${aging}명이 31세 이상 — 세대교체 대비 필요`);
    if (expiring) notes.push(`주전 ${expiring}명의 계약이 1년 안에 끝남`);
    return { unit: u, need, starters, starterAvg, benchmark, gap, depth, aging, expiring, urgency, verdict, notes };
  });

  const priorities = [...units].filter((r) => r.verdict === 'weak' || r.urgency >= 3).sort((a, b) => b.urgency - a.urgency).slice(0, 3);
  const strengths = units.filter((r) => r.verdict === 'strong').sort((a, b) => b.gap - a.gap);
  const unhappy = club.squad.filter((id) => w.players[id].unhappy).length;

  // 요약 문장
  const parts: string[] = [];
  if (last) {
    const pos = sortTable(Object.fromEntries(last.table.map((r) => [r.club, r]))).findIndex((r) => r.club === clubId) + 1;
    if (pos > 0) parts.push(`지난 시즌 ${pos}위.`);
  }
  if (strengths.length) {
    const names = strengths.slice(0, 2).map((s) => s.unit.label);
    parts.push(`${names.length === 2 ? josa(names[0], '과', '와') + ' ' + josa(names[1], '이', '가') : josa(names[0], '이', '가')} 강점입니다.`);
  }
  if (priorities.length) {
    const top = priorities[0];
    parts.push(`가장 시급한 보강 포지션은 ${top.unit.label}입니다${top.notes[0] ? ` (${top.notes[0]})` : ''}.`);
    if (priorities.length > 1) parts.push(`그다음은 ${priorities.slice(1).map((p) => p.unit.label).join(', ')} 순입니다.`);
  } else parts.push('뚜렷한 약점 없이 균형 잡힌 선수단입니다.');
  if (unhappy) parts.push(`출전 시간에 불만인 선수 ${unhappy}명은 정리하거나 기회를 주는 것이 좋겠습니다.`);
  return { units, summary: parts.join(' '), priorities };
}

/** 이적 화면 검색 조건 추천: 묶음 · 최소 능력(현재 주전 수준) · 최대 나이 */
export interface SearchPreset { positions: Position[]; label: string; minOvr: number; maxAge: number }
export function searchPreset(r: UnitReport): SearchPreset {
  // 현재 주전 평균보다 조금 높은 선수부터 (너무 높으면 영입 가능한 선수가 없음)
  const base = r.starters.length ? r.starterAvg + 1 : Math.max(55, r.benchmark - 6);
  return { positions: r.unit.members, label: r.unit.label, minOvr: Math.max(55, Math.min(Math.round(base), Math.round(r.benchmark))), maxAge: r.aging ? 28 : 31 };
}
