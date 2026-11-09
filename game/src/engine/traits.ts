// 호칭: 경기 기록이 쌓이면 매달 낮은 확률로 붙고, 플레이 스타일이 바뀌거나 노쇠하면 시즌 말에 사라질 수 있다
// - 새 게임 시작 때: 실제 시즌 기록(소속 이력 · 시즌별 능력)으로 베테랑 · 스타 선수에게 시작 호칭을 준다
//   (실존 인물 보호: 시작 호칭은 긍정 · 양날의 검만, 부정 호칭은 게임을 진행하며 생긴 것만)
// - 사용자 구단 · AI 구단 모두 같은 규칙. 판정은 게임 안의 기록과 데이터 능력치만 사용 (실제 선수에 대한 평가가 아님)
import type { AttrKey } from '../data/types';
import type { GameEvent, PlayerState, World } from './types';
import type { Rng } from './rng';
import { overall } from './ratings';

export type TraitKind = 'double' | 'positive' | 'negative';
type Group = 'GK' | 'DF' | 'MF' | 'FW';

/** 판정에 쓰는 값 */
interface Ctx {
  apps: number; avg: number; group: Group; age: number; ovr: number; peak: number;
  clubSeasons: number; oneClub: boolean; wonWithClub: boolean; careerAvg: number;
}
/** 새 게임 시작 때 판정 값 (실제 시즌 기록에서) */
export interface SeedCtx { group: Group; age: number; ovr: number; peak: number; exp: number; clubStreak: number; oneClub: boolean; /** 베테랑 보정: 스타일 기준을 낮춤 */ b: number }

export interface TraitDef {
  id: string;
  ko: string;
  kind: TraitKind;
  /** 붙는 조건 (사람이 읽는 설명) */
  how: string;
  plus?: string;
  minus?: string;
  attrs?: Partial<Record<AttrKey, number>>;
  /** 경고 · 퇴장 확률 배수 */
  card?: number;
  /** 부상 확률 배수 */
  injury?: number;
  /** 큰 경기 / 그 외 경기 당일 컨디션 보정 (비율) */
  big?: number;
  small?: number;
  /** 경기 기복 배수 (1보다 작으면 꾸준) */
  spread?: number;
  /** 연속 벤치 때 충성도 하락 배수 */
  bench?: number;
  permanent?: boolean;
  /** 시즌 말에만 판정 (매달 판정 안 함) */
  seasonOnly?: boolean;
  /** 같이 가질 수 없는 호칭 */
  excludes?: string[];
  /** 경기 기록으로 얻는 조건 */
  check: (p: PlayerState, c: Ctx) => boolean;
  /** 플레이 스타일(능력치)이 맞는지. slack 만큼 기준을 낮춤 (유지 판정은 여유를 둔다) */
  style?: (p: PlayerState, g: Group, slack: number) => boolean;
  /** 새 게임 시작 호칭 조건 */
  seed?: (p: PlayerState, s: SeedCtx) => boolean;
}

/** 시즌 행동 기록 (시즌마다 초기화) */
export interface TraitLog { inj: number; late: number; bigN: number; bigSum: number }
export const emptyLog = (): TraitLog => ({ inj: 0, late: 0, bigN: 0, bigSum: 0 });

const per = (n: number, apps: number) => (apps ? n / apps : 0);
const bigAvg = (p: PlayerState) => (p.tlog && p.tlog.bigN ? p.tlog.bigSum / p.tlog.bigN : 0);
const a = (p: PlayerState, k: AttrKey) => p.base[k] ?? 0;

export const TRAITS: TraitDef[] = [
  // ── 완전 긍정 (조건 까다로움) ──
  { id: 'legend', ko: '구단 레전드', kind: 'positive', permanent: true, how: '한 구단에서 8시즌 이상 핵심으로 뛰며 우승',
    plus: '충성도 최대 · 리더십 +2', attrs: { ldr: 2 },
    check: (_p, c) => c.clubSeasons >= 8 && c.careerAvg >= 6.9 && c.wonWithClub,
    seed: (_p, s) => s.clubStreak >= 8 && s.peak >= 80 },
  { id: 'oneclub', ko: '원클럽맨', kind: 'positive', permanent: true, how: '1부 리그 데뷔 구단에서만 6시즌 이상',
    plus: '충성도 최대', check: (_p, c) => c.oneClub && c.clubSeasons >= 6,
    seed: (_p, s) => s.oneClub && s.exp >= 7 },
  { id: 'pro', ko: '프로페셔널', kind: 'positive', how: '부상 · 퇴장 없이 많이 뛰며 평점이 꾸준함 · 나이가 들어도 기량 유지', excludes: ['trouble', 'glass', 'decline'],
    plus: '경기 기복이 작아짐', spread: 0.85,
    check: (p, c) => c.apps >= 20 && (p.tlog?.inj ?? 0) === 0 && p.stats.red === 0 && p.stats.yellow <= 3 && c.avg >= 7.0,
    seed: (_p, s) => s.age >= 31 && s.exp >= 8 && s.ovr >= s.peak - 3 && s.ovr >= 78 },
  { id: 'teamplayer', ko: '팀플레이어', kind: 'positive', how: '도움과 출전을 고르게 쌓고 불만이 없음',
    plus: '패스 · 시야 +1', attrs: { pas: 1, vis: 1 },
    check: (p, c) => c.apps >= 18 && p.stats.assists >= 5 && !p.unhappy && p.loyalty >= 60,
    style: (p, g, s) => g !== 'GK' && a(p, 'pas') >= 80 - s && a(p, 'vis') >= 78 - s,
    seed: (p, s) => s.age >= 28 && s.exp >= 5 && a(p, 'pas') >= 82 - s.b && a(p, 'vis') >= 79 - s.b && s.group === 'MF' },
  { id: 'hustle', ko: '허슬 플레이', kind: 'positive', how: '활동량이 많은 선수가 쉬지 않고 출전',
    plus: '체력 · 태클 +1', attrs: { sta: 1, tac: 1 },
    check: (p, c) => p.stats.apps >= 20 && a(p, 'sta') >= 75 && a(p, 'tac') >= 65 && c.avg >= 6.8 && c.group !== 'GK',
    style: (p, g, s) => g !== 'GK' && a(p, 'sta') >= 82 - s && a(p, 'tac') >= 72 - s,
    seed: (p, s) => s.exp >= 4 && (s.group === 'MF' || s.group === 'DF') && a(p, 'sta') >= 86 - s.b && a(p, 'tac') >= 78 - s.b },

  // ── 양날의 검 ──
  { id: 'captain', ko: '캡틴', kind: 'double', how: '경험 많은 리더 · 라커룸의 중심',
    plus: '리더십 +2 · 침착성 +1', minus: '벤치에 앉으면 불만이 빨리 쌓임', attrs: { ldr: 2, com: 1 }, bench: 1.6,
    check: (p, c) => c.age >= 28 && c.clubSeasons >= 3 && a(p, 'ldr') >= 82 && c.apps >= 20,
    style: (p, _g, s) => a(p, 'ldr') >= 80 - s,
    seed: (p, s) => s.age >= 28 && s.exp >= 5 && a(p, 'ldr') >= 83 - s.b },
  { id: 'bigman', ko: '큰 경기의 사나이', kind: 'double', how: '강팀과의 경기에서 꾸준히 활약', excludes: ['bottler'],
    plus: '큰 경기 컨디션 ↑', minus: '약팀전 집중력 ↓', big: 0.025, small: -0.008,
    check: (p, c) => (p.tlog?.bigN ?? 0) >= 4 && bigAvg(p) >= 7.1 && bigAvg(p) >= c.avg + 0.4,
    style: (p, _g, s) => overall(p) >= 84 - s,
    seed: (_p, s) => s.peak >= 86 - s.b && s.exp >= 6 && s.ovr >= 83 - s.b },
  { id: 'maestro', ko: '마에스트로', kind: 'double', how: '경기를 지휘하는 플레이메이커',
    plus: '패스 · 시야 +2', minus: '몸싸움 −1', attrs: { pas: 2, vis: 2, str: -1 },
    check: (p, c) => p.stats.assists >= 8 && c.group !== 'GK' && per(p.stats.assists, c.apps) >= 0.3,
    style: (p, g, s) => g !== 'GK' && a(p, 'pas') >= 86 - s && a(p, 'vis') >= 86 - s,
    seed: (p, s) => s.exp >= 3 && s.group !== 'GK' && a(p, 'pas') >= 88 - s.b && a(p, 'vis') >= 88 - s.b },
  { id: 'clutch', ko: '해결사', kind: 'double', how: '경기 막판 동점골 · 결승골을 반복',
    plus: '침착성 +2', minus: '평소 기복이 조금 커짐', attrs: { com: 2 }, spread: 1.12,
    check: (p) => (p.tlog?.late ?? 0) >= 3,
    style: (p, g, s) => g !== 'GK' && a(p, 'sho') >= 85 - s && a(p, 'com') >= 85 - s,
    seed: (p, s) => s.exp >= 4 && (s.group === 'FW' || s.group === 'MF') && a(p, 'sho') >= 87 - s.b && a(p, 'com') >= 87 - s.b },
  { id: 'wall', ko: '철벽', kind: 'double', how: '수비수 · 골키퍼로 무실점 경기를 많이 쌓음',
    plus: '위치 선정 +2', minus: '패스 −1', attrs: { pos: 2, pas: -1 },
    check: (p, c) => (c.group === 'DF' || c.group === 'GK') && p.stats.cleanSheets >= 9,
    style: (p, g, s) => (g === 'DF' && a(p, 'pos') >= 84 - s && a(p, 'tac') >= 82 - s) || (g === 'GK' && a(p, 'ref') >= 85 - s && a(p, 'pos') >= 82 - s),
    seed: (p, s) => s.exp >= 4 && ((s.group === 'DF' && a(p, 'pos') >= 86 - s.b && a(p, 'tac') >= 85 - s.b) || (s.group === 'GK' && a(p, 'ref') >= 87 - s.b && a(p, 'pos') >= 84 - s.b)) },
  { id: 'lungs', ko: '두 개의 폐', kind: 'double', how: '지치지 않는 체력으로 거의 모든 경기를 선발 출전',
    plus: '체력 · 시야 +1', minus: '부상 확률 ↑', attrs: { sta: 1, vis: 1 }, injury: 1.3,
    check: (p, c) => p.stats.apps >= 22 && p.stats.subApps <= 1 && a(p, 'sta') >= 86 && c.group !== 'GK',
    style: (p, g, s) => g !== 'GK' && a(p, 'sta') >= 86 - s,
    seed: (p, s) => s.exp >= 3 && s.group !== 'GK' && a(p, 'sta') >= 91 - s.b },
  { id: 'badboy', ko: '악동', kind: 'double', how: '거친 플레이와 공격 포인트를 함께 쌓음',
    plus: '슈팅 · 몸싸움 +1', minus: '카드 확률 ↑ · 침착성 −2', attrs: { sho: 1, str: 1, com: -2 }, card: 1.4,
    check: (p, c) => c.apps >= 10 && per(p.stats.yellow + p.stats.red * 3, c.apps) >= 0.28 && per(p.stats.goals + p.stats.assists, c.apps) >= 0.35 },

  // ── 완전 부정 (게임 진행 중에만 생김) ──
  { id: 'decline', ko: '하락세', kind: 'negative', seasonOnly: true, how: '전성기가 지나 기량이 눈에 띄게 떨어짐', excludes: ['pro'],
    minus: '경기 기복 ↑ · 침착성 −1', attrs: { com: -1 }, spread: 1.15,
    check: (_p, c) => c.age >= 30 && c.ovr <= c.peak - 6 },
  { id: 'trouble', ko: '트러블메이커', kind: 'negative', how: '경고 · 퇴장이 반복됨', excludes: ['pro'],
    minus: '카드 확률 크게 ↑ · 침착성 −1', attrs: { com: -1 }, card: 1.6,
    check: (p, c) => c.apps >= 8 && (p.stats.red >= 2 || per(p.stats.yellow, c.apps) >= 0.4) },
  { id: 'glass', ko: '유리몸', kind: 'negative', how: '한 시즌에 부상이 반복됨', excludes: ['pro'],
    minus: '부상 확률 ↑', injury: 1.5, check: (p) => (p.tlog?.inj ?? 0) >= 3 },
  { id: 'bottler', ko: '새가슴', kind: 'negative', how: '큰 경기마다 부진', excludes: ['bigman'],
    minus: '큰 경기 컨디션 ↓', big: -0.03, check: (p, c) => (p.tlog?.bigN ?? 0) >= 5 && c.apps >= 12 && bigAvg(p) <= c.avg - 0.6 },
  { id: 'flop', ko: '먹튀', kind: 'negative', how: '고액 이적 후 오래 부진',
    minus: '사기 ↓', check: (p, c) => (p.lastFee ?? 0) >= 40e6 && c.apps >= 12 && c.avg < 6.6 },
];
export const TRAIT = new Map(TRAITS.map((t) => [t.id, t]));
export const MAX_TRAITS = 3;

// ── 효과 ───────────────────────────────────────────
export function traitAttr(p: PlayerState, k: AttrKey): number {
  if (!p.traits.length) return 0;
  let s = 0;
  for (const id of p.traits) s += TRAIT.get(id)?.attrs?.[k] ?? 0;
  return s;
}
export function traitMul(p: PlayerState, key: 'card' | 'injury' | 'spread' | 'bench'): number {
  let m = 1;
  for (const id of p.traits) m *= TRAIT.get(id)?.[key] ?? 1;
  return m;
}
export function traitForm(p: PlayerState, bigMatch: boolean): number {
  let f = 0;
  for (const id of p.traits) { const t = TRAIT.get(id); f += (bigMatch ? t?.big : t?.small) ?? 0; }
  return f;
}

// ── 공통 ───────────────────────────────────────────
const groupOf = (p: PlayerState): Group => (p.pos === 'GK' ? 'GK' : ['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(p.pos) ? 'DF' : p.pos === 'ST' ? 'FW' : 'MF');
const ageAt = (birth: string, date: string) => Math.floor((Date.parse(date) - Date.parse(birth)) / (365.25 * 86400000));
const eunNeun = (w: string) => { const c = w.charCodeAt(w.length - 1) - 0xac00; return c >= 0 && c < 11172 && c % 28 ? '이' : '가'; };
const eulReul = (w: string) => { const c = w.charCodeAt(w.length - 1) - 0xac00; return c >= 0 && c < 11172 && c % 28 ? '을' : '를'; };

function ctxOf(w: World, p: PlayerState): Ctx {
  const apps = p.stats.apps + p.stats.subApps;
  const club = p.clubId;
  let clubSeasons = 0, ratingSum = 0, rated = 0, won = false;
  for (let i = p.career.length - 1; i >= 0; i--) {
    const c = p.career[i];
    if (c.club !== club) break;
    clubSeasons++;
    if (c.rating != null) { ratingSum += c.rating; rated++; }
    if (w.history.some((h) => h.season === c.season && h.champion === club)) won = true;
  }
  const ovr = overall(p);
  return {
    apps, avg: apps ? p.stats.ratingSum / apps : 0, group: groupOf(p), age: ageAt(p.birth, w.date), ovr, peak: Math.max(p.peak ?? ovr, ovr),
    clubSeasons: clubSeasons + (p.seedClubSeasons ?? 0), wonWithClub: won,
    oneClub: p.career.every((c) => c.club === club) && (p.career.length > 0 || !!p.seedOneClub), careerAvg: rated ? ratingSum / rated : 0,
  };
}
const canTake = (p: PlayerState, t: TraitDef) => !p.traits.includes(t.id) && !t.excludes?.some((x) => p.traits.includes(x));

// ── 새 게임 시작 호칭 ──────────────────────────────
/** 선수 이력: 시즌 데이터에서 만든 파일 (scripts/history.ts) */
export interface PlayerHistory { seasons: string[]; clubs: string[]; p: Record<string, string> }

/** 실제 시즌 기록으로 베테랑 · 스타 선수에게 시작 호칭 (최대 2개, 한 칸은 게임에서 얻도록 비워 둠) */
export function seedTraits(w: World, hist: PlayerHistory, rng: Rng): number {
  const start = hist.seasons.indexOf(w.season);
  const before = start >= 0 ? start : hist.seasons.filter((s) => s < w.season).length;
  let given = 0;
  for (const p of Object.values(w.players)) {
    if (!p.clubId || p.retired) continue;
    const rows = (hist.p[p.id] ?? '').split(',').filter(Boolean).map((r) => r.split('.').map(Number)).filter(([si]) => si < before);
    const ovr = overall(p);
    const peak = Math.max(ovr, ...rows.map((r) => r[2]));
    p.peak = peak;
    const age = ageAt(p.birth, w.date);
    // 데이터가 2000/01부터라 그 전 경력은 나이로 짐작 (초반 시즌에서 시작할 때만)
    const exp = Math.max(rows.length, before < 5 ? Math.max(0, Math.min(age - 21, 12)) : 0);
    let clubStreak = 0;
    for (let i = rows.length - 1, si = before - 1; i >= 0 && rows[i][0] === si && hist.clubs[rows[i][1]] === p.clubId; i--, si--) clubStreak++;
    const firstAge = rows.length ? ageAt(p.birth, `${hist.seasons[rows[0][0]].slice(0, 4)}-09-01`) : 99;
    const oneClub = rows.length > 0 && rows.every((r) => hist.clubs[r[1]] === p.clubId) && firstAge <= 22;
    p.seedClubSeasons = clubStreak;
    p.seedOneClub = oneClub;
    if (exp < 3 && age < 27) continue;
    const s: SeedCtx = { group: groupOf(p), age, ovr, peak, exp, clubStreak, oneClub, b: age >= 29 && exp >= 5 ? 3 : 0 };
    for (const t of TRAITS) {
      if (p.traits.length >= 2) break;
      if (!t.seed || t.kind === 'negative' || !canTake(p, t) || !t.seed(p, s) || !rng.chance(0.8)) continue;
      p.traits.push(t.id);
      if (t.id === 'legend' || t.id === 'oneclub') p.loyalty = 100;
      given++;
    }
  }
  return given;
}

const CHANCE: Record<TraitKind, number> = { double: 0.05, positive: 0.035, negative: 0.05 };

/** 매달 1일: 조건을 채운 선수에게 낮은 확률로 호칭 부여 (10월~5월) */
export function traitMonth(w: World, rng: Rng): GameEvent[] {
  const m = +w.date.slice(5, 7);
  if (w.date.slice(8) !== '01' || (m > 5 && m < 10)) return [];
  const events: GameEvent[] = [];
  for (const p of Object.values(w.players)) {
    if (!p.clubId || p.retired || p.traits.length >= MAX_TRAITS) continue;
    if (p.stats.apps + p.stats.subApps < 8 && !p.career.length) continue;
    const c = ctxOf(w, p);
    const ace = p.stats.apps >= 12 && p.stats.subApps <= p.stats.apps / 3 ? 1.5 : 1;
    for (const t of TRAITS) {
      if (t.seasonOnly || !canTake(p, t)) continue;
      if (!t.check(p, c) || !rng.chance(CHANCE[t.kind] * ace)) continue;
      p.traits.push(t.id);
      if (t.id === 'legend' || t.id === 'oneclub') p.loyalty = 100;
      if (t.id === 'flop') p.morale = Math.max(0, p.morale - 15);
      if (p.clubId === w.userClubId) events.push({ type: 'info', date: w.date, text: `${p.name} 선수에게 호칭 「${t.ko}」${eunNeun(t.ko)} 붙었습니다 — ${t.how}` });
      break;    // 한 달에 하나까지
    }
  }
  return events;
}

/**
 * 시즌 말 정리
 * - 영구 호칭(레전드 · 원클럽맨)은 유지
 * - 이번 시즌 기록으로 다시 조건을 채웠거나, 플레이 스타일(능력치)이 아직 맞으면 유지
 * - 스타일이 더는 맞지 않으면(노쇠화 · 역할 변화) 70%, 기록만 끊겼으면 40% 확률로 사라짐
 * - 30세 이상이 전성기보다 6 이상 떨어지면 50% 확률로 「하락세」, 기량이 회복되면 사라짐
 */
export function traitSeasonEnd(w: World, rng: Rng): string[] {
  const notes: string[] = [];
  for (const p of Object.values(w.players)) {
    if (!p.clubId || p.retired) continue;
    const c = ctxOf(w, p);
    p.peak = c.peak;
    const mine = p.clubId === w.userClubId;
    p.traits = p.traits.filter((id) => {
      const t = TRAIT.get(id);
      if (!t) return false;
      if (t.permanent) return true;
      if (t.id === 'decline') {
        if (c.ovr < c.peak - 3) return true;
        if (mine) notes.push(`${p.name} — 기량을 되찾아 「하락세」에서 벗어났습니다`);
        return false;
      }
      if (t.check(p, c)) return true;
      const styleOk = t.style ? t.style(p, c.group, 4) : null;
      if (styleOk === true && c.ovr > c.peak - 6) return true;
      const gone = rng.chance(styleOk === null ? 0.4 : 0.7);
      if (gone && mine) notes.push(`${p.name} — 「${t.ko}」${eulReul(t.ko)} 잃었습니다 (${c.age >= 30 && c.ovr <= c.peak - 4 ? '나이로 인한 기량 저하' : styleOk === false ? '플레이 스타일 변화' : '활약이 이어지지 않음'})`);
      return !gone;
    });
    const dec = TRAIT.get('decline')!;
    if (p.traits.length < MAX_TRAITS && canTake(p, dec) && dec.check(p, c) && rng.chance(0.5)) {
      p.traits.push('decline');
      if (mine) notes.push(`${p.name} — 「하락세」 (전성기 ${c.peak} → 현재 ${c.ovr})`);
    }
  }
  for (const n of notes) w.inbox.push({ type: 'info', date: w.date, text: `호칭 변화 · ${n}` });
  return notes;
}
