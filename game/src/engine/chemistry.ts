// 라커룸 · 팀 케미
//
// 팀 케미 (0~100): 핵심 선수 16명 (능력 순) 기준
//  - 함께한 시간 30%: 현 구단 연속 시즌 (실제 기록 seedClubSeasons + 게임 속 시즌), 4시즌이면 만점
//  - 유대 20%: 리그 나라 말을 쓰거나 같은 언어권 동료가 있는 (말이 통하는) 선수 비율
//  - 사기 30%: 평균 사기 30 → 0점, 90 → 만점
//  - 리더십 20%: 주장 (지정하지 않으면 리더십이 가장 높은 24세 이상)의 리더십
//  - 불만 감점: 출전 불만 · 언론 플레이 · 오래 벤치인 핵심 선수 1명마다 −8 (최대 −32)
// 경기 효과: 팀 전체 ×0.97 ~ ×1.03 (케미 50 = ×1.00) — 포메이션 숙련도처럼
//
// 라커룸 (내 구단, 매일):
//  - 영향력 상위 3명 중 불만인 선수가 있으면 선수단 사기가 조금씩 떨어진다 (한 명당 하루 −0.25) → 30일마다 알림
//  - 주장이 리더십 70 이상이고 사기가 좋으면 선수단 사기가 65 쪽으로 조금씩 오른다
//  - 팀 미팅 (30일에 한 번): 케미 · 최근 성적 · 주장 리더십에 따라 성공 (전원 사기 +6) · 실패 (−4)
import type { ClubState, PlayerState, World } from './types';
import type { Rng } from './rng';
import { overall, attr } from './ratings';
import { ageOn } from './condition';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const LEAGUE_NATION: Record<string, string> = { eng: 'ENG', esp: 'ESP', ita: 'ITA', ger: 'GER', fra: 'FRA' };
/** 언어권 (국적 → 언어). 없는 나라는 그 나라 말 */
const LANG_OF: Record<string, string[]> = {
  es: ['ESP', 'ARG', 'URU', 'COL', 'MEX', 'CHI', 'PER', 'ECU', 'VEN', 'PAR', 'BOL', 'CRC', 'HON', 'PAN', 'GUA', 'SLV', 'CUB', 'DOM', 'EQG'],
  pt: ['POR', 'BRA', 'ANG', 'MOZ', 'CPV', 'GNB'],
  fr: ['FRA', 'BEL', 'SUI', 'SEN', 'CIV', 'CMR', 'MLI', 'GUI', 'COD', 'CGO', 'GAB', 'BFA', 'TOG', 'BEN', 'NIG', 'ALG', 'MAR', 'TUN', 'HAI', 'MAD', 'LUX', 'MTQ', 'GLP', 'GUF', 'COM', 'CTA', 'TCD', 'MTN', 'BDI', 'RWA'],
  en: ['ENG', 'SCO', 'WAL', 'NIR', 'IRL', 'USA', 'CAN', 'AUS', 'NZL', 'JAM', 'TRI', 'NGA', 'GHA', 'RSA', 'ZIM', 'ZAM', 'KEN', 'UGA', 'GAM', 'SLE', 'LBR'],
  de: ['GER', 'AUT', 'LIE'],
  nl: ['NED', 'SUR', 'CUW'],
  it: ['ITA', 'SMR'],
  sr: ['SRB', 'CRO', 'BIH', 'MNE'],
  sc: ['DEN', 'SWE', 'NOR'],
};
const LANG = new Map(Object.entries(LANG_OF).flatMap(([l, ns]) => ns.map((n) => [n, l] as const)));
const langOf = (nation: string) => LANG.get(nation) ?? nation;
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

/** 현 구단 연속 시즌 (지난 시즌까지) */
export function tenureOf(p: PlayerState): number {
  let n = 0;
  for (let i = p.career.length - 1; i >= 0 && p.career[i].club === p.clubId; i--) n++;
  // 게임 속 기록이 처음부터 이 구단이면 시작 전 실제 기록도 더한다
  return n + (p.career.every((c) => c.club === p.clubId) ? p.seedClubSeasons ?? 0 : 0);
}

const unrestOf = (p: PlayerState) => !!p.unhappy || (!!p.saga && p.saga.club === p.clubId) || p.benchStreak >= 6;

/** 라커룸 영향력: 리더십 · 함께한 시간 · 나이 · 능력 · 주장 */
export function influenceOf(w: World, p: PlayerState, captain?: string): number {
  return attr(p, 'ldr') * 0.4 + Math.min(tenureOf(p), 6) * 6 + clamp(ageOn(p.birth, w.date) - 20, 0, 14) * 2 + (overall(p) - 60) * 0.8 + (p.id === captain ? 15 : 0);
}

/** 주장: 지정한 선수 (선수단에 있으면), 아니면 리더십이 가장 높은 24세 이상 핵심 선수 */
export function captainOf(w: World, club: ClubState, core?: PlayerState[]): PlayerState | null {
  if (club.captain && club.squad.includes(club.captain) && !w.players[club.captain]?.loan) return w.players[club.captain];
  const cs = (core ?? coreOf(w, club)).filter((p) => ageOn(p.birth, w.date) >= 24);
  return cs.sort((a, b) => attr(b, 'ldr') - attr(a, 'ldr'))[0] ?? null;
}

const coreOf = (w: World, club: ClubState) => club.squad.map((id) => w.players[id]).filter(Boolean).sort((a, b) => overall(b) - overall(a)).slice(0, 16);

export interface Chemistry {
  total: number;
  parts: { tenure: number; bond: number; morale: number; leader: number; unrest: number };
  captain: string | null;
  /** 영향력 상위 5명 */
  leaders: { id: string; inf: number }[];
  /** 말이 통하는 동료가 없는 핵심 선수 · 불만 핵심 선수 · 새로 온 핵심 선수 */
  isolated: string[]; unrest: string[]; newcomers: string[];
}

export function chemistry(w: World, clubId: string): Chemistry {
  const club = w.clubs[clubId];
  const core = coreOf(w, club);
  const nation = LEAGUE_NATION[club.league.slice(0, 3)];
  const n = Math.max(1, core.length);
  const tenure = (core.reduce((s, p) => s + Math.min(tenureOf(p), 4), 0) / n / 4) * 100;
  // 말이 통하는가: 리그 나라 말을 쓰거나, 같은 언어권 동료가 있으면
  const langs = new Map<string, number>();
  for (const id of club.squad) { const x = w.players[id]?.nation; if (x) langs.set(langOf(x), (langs.get(langOf(x)) ?? 0) + 1); }
  const home = langOf(nation ?? '');
  const isolated = core.filter((p) => langOf(p.nation) !== home && (langs.get(langOf(p.nation)) ?? 0) < 2).map((p) => p.id);
  const bond = ((n - isolated.length) / n) * 100;
  const morale = clamp((core.reduce((s, p) => s + p.morale, 0) / n - 30) / 60, 0, 1) * 100;
  const cap = captainOf(w, club, core);
  const leader = cap ? clamp((attr(cap, 'ldr') - 40) / 50, 0, 1) * 100 : 30;
  const unrest = core.filter(unrestOf).map((p) => p.id);
  const unrestPen = Math.min(32, unrest.length * 8);
  const total = Math.round(clamp(0.3 * tenure + 0.2 * bond + 0.3 * morale + 0.2 * leader - unrestPen, 0, 100));
  const leaders = club.squad.map((id) => w.players[id]).filter((p) => p && !p.loan)
    .map((p) => ({ id: p.id, inf: Math.round(influenceOf(w, p, cap?.id)) })).sort((a, b) => b.inf - a.inf).slice(0, 5);
  return {
    total, parts: { tenure: Math.round(tenure), bond: Math.round(bond), morale: Math.round(morale), leader: Math.round(leader), unrest: unrestPen },
    captain: cap?.id ?? null, leaders, isolated, unrest, newcomers: core.filter((p) => tenureOf(p) === 0).map((p) => p.id),
  };
}

/** 경기 배율: 케미 0 → ×0.97 · 50 → ×1.00 · 100 → ×1.03 */
export const chemMult = (total: number) => 0.97 + 0.06 * clamp(total, 0, 100) / 100;

/** 라커룸 하루 (내 구단): 영향력 큰 불만 선수 → 사기 전염, 좋은 주장 → 사기 안정 */
export function lockerDay(w: World): void {
  const club = w.clubs[w.userClubId];
  if (!club) return;
  const ps = club.squad.map((id) => w.players[id]).filter(Boolean);
  const cap = captainOf(w, club);
  const top = ps.filter((p) => !p.loan).map((p) => ({ p, inf: influenceOf(w, p, cap?.id) })).sort((a, b) => b.inf - a.inf).slice(0, 3);
  const angry = top.filter(({ p }) => unrestOf(p)).map(({ p }) => p);
  if (angry.length) {
    for (const p of ps) if (!angry.includes(p)) p.morale = clamp(p.morale - 0.25 * angry.length, 0, 100);
    if (!w.lockerWarn || w.lockerWarn <= w.date) {
      w.lockerWarn = addDays(w.date, 30);
      w.inbox.push({ type: 'locker', date: w.date, kind: 'unrest', players: angry.map((p) => p.id) });
    }
  } else if (cap && attr(cap, 'ldr') >= 70 && cap.morale >= 60) {
    for (const p of ps) if (p.morale < 65) p.morale = Math.min(65, p.morale + 0.1);
  }
}

/** 팀 미팅 가능 날짜 (30일에 한 번) */
export const meetingReady = (w: World) => !w.lastMeeting || addDays(w.lastMeeting, 30) <= w.date;

/** 팀 미팅: 성공 확률 = 0.35 + 케미 · 최근 5경기 승점 · 주장 리더십 */
export function teamMeeting(w: World, rng: Rng): { ok: boolean; text: string } {
  const club = w.clubs[w.userClubId];
  const chem = chemistry(w, club.id);
  const recent = Object.values(w.competitions).flatMap((c) => c.fixtures)
    .filter((f) => f.result && (f.home === club.id || f.away === club.id)).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5);
  const pts = recent.reduce((s, f) => { const mine = f.home === club.id ? f.result!.homeGoals : f.result!.awayGoals, opp = f.home === club.id ? f.result!.awayGoals : f.result!.homeGoals; return s + (mine > opp ? 3 : mine === opp ? 1 : 0); }, 0);
  const cap = chem.captain ? w.players[chem.captain] : null;
  const p = clamp(0.35 + (chem.total - 50) / 200 + (recent.length ? (pts / (recent.length * 3) - 0.4) * 0.4 : 0) + (cap ? (attr(cap, 'ldr') - 60) / 300 : 0), 0.15, 0.9);
  w.lastMeeting = w.date;
  const ok = rng.chance(p);
  for (const id of club.squad) { const pl = w.players[id]; pl.morale = clamp(pl.morale + (ok ? 6 : -4), 0, 100); }
  return ok
    ? { ok, text: `팀 미팅이 잘 끝났습니다. ${cap ? `주장 중심으로 ` : ''}선수단이 다시 하나로 뭉쳤습니다 (선수단 사기 +6)` }
    : { ok, text: '팀 미팅이 오히려 역효과를 냈습니다. 선수들이 감독의 말에 공감하지 못했습니다 (선수단 사기 −4)' };
}
