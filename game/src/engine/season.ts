// 시즌 전환: 지난 시즌 마감 → 다음 시즌 준비
//
// 규칙 (설계서 5.6)
//  - 능력치는 실제를 따른다: 다음 시즌 데이터에 있는 선수는 기준선(base)을 그 시즌 값으로 갱신. 육성 보정(growth)은 유지
//  - 소속은 게임 세계를 따른다: 게임 속 구단을 유지 (실제로 이적했어도 그대로)
//  - 미래 선수: 다음 시즌 데이터에 처음 나오는 선수는 실제 소속 구단으로 등장. 그 구단이 리그에 없거나 꽉 찼으면 FA
//  - 데이터가 끝난 뒤(2026/27~): 나이에 따른 성장 · 노화 엔진
//  - 강등 · 승격: 실제 다음 시즌에 새로 올라온 구단 수만큼 게임 순위 하위 구단을 내린다
//    (2부 리그는 아직 없음 → 사용자 구단이 강등권이면 잔류 처리하고 그 위 구단을 내림)
import type { AttrKey } from '../data/types';
import type { PlayerState, SeasonRecord, World } from './types';
import type { SeasonInput } from './world';
import { emptyStats, newPlayer } from './world';
import { buildFixtures, seasonStart } from './fixtures';
import { emptyRow, sortTable } from './standings';
import { createRng, type Rng } from './rng';
import { ageOn } from './condition';
import { FORMATIONS, guessFormation } from './squad';

export const MAX_SQUAD = 32;
export const nextSeasonOf = (s: string) => {
  const y = +s.slice(0, 4) + 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
};

export interface SeasonReport {
  from: string;
  to: string;
  champions: Record<string, string>;
  relegated: Record<string, string[]>;
  promoted: Record<string, string[]>;
  retired: string[];
  debuts: string[];
  released: string[];
  updated: number;       // 실제 데이터로 능력치가 갱신된 선수 수
  aged: number;          // 성장 엔진으로 바뀐 선수 수
  userKept: boolean;     // 사용자 구단이 강등권이었지만 잔류 처리됐는지
}

/** 1) 지난 시즌 마감: 순위 기록 · 선수 커리어 기록 */
export function closeSeason(w: World): SeasonRecord[] {
  const recs: SeasonRecord[] = [];
  for (const comp of Object.values(w.competitions)) {
    const table = sortTable(comp.table);
    const ps = Object.values(w.players).filter((p) => p.clubId && w.clubs[p.clubId]?.league === comp.id);
    const top = ps.sort((a, b) => b.stats.goals - a.stats.goals)[0];
    recs.push({
      season: w.season, league: comp.id, table, champion: table[0]?.club,
      topScorer: top && top.stats.goals > 0 ? { player: top.id, club: top.clubId, goals: top.stats.goals } : null,
    });
  }
  for (const p of Object.values(w.players)) {
    if (p.retired) continue;
    const apps = p.stats.apps + p.stats.subApps;
    p.career.push({ season: w.season, club: p.clubId, apps, goals: p.stats.goals, assists: p.stats.assists, rating: apps ? Math.round((p.stats.ratingSum / apps) * 100) / 100 : null });
  }
  w.history.push(...recs);
  return recs;
}

/** 데이터가 끝난 뒤의 성장 · 노화 (시즌 1회) */
function ageAttributes(p: PlayerState, age: number, rng: Rng) {
  const physical: AttrKey[] = ['pac', 'sta', 'str'];
  const minutesBonus = Math.min(1, (p.career.at(-1)?.apps ?? 0) / 25);
  for (const k of Object.keys(p.base) as AttrKey[]) {
    let d: number;
    if (age <= 21) d = rng.int(1, 4) + (minutesBonus > 0.5 ? 1 : 0);
    else if (age <= 24) d = rng.int(0, 3);
    else if (age <= 28) d = rng.int(-1, 1);
    else if (age <= 31) d = rng.int(-2, 1);
    else d = rng.int(-4, 0);
    if (physical.includes(k) && age >= 30) d -= rng.int(0, 2);
    if (['vis', 'com', 'ldr', 'pos'].includes(k) && age >= 28) d = Math.max(d, rng.int(-1, 1));
    p.base[k] = Math.max(20, Math.min(97, (p.base[k] ?? 50) + d));
  }
}

const retireChance = (age: number, ovrish: number) => (age < 33 ? 0 : age < 35 ? 0.15 : age < 37 ? 0.45 : age < 39 ? 0.8 : 1) * (ovrish > 80 ? 0.6 : 1);

/**
 * 2) 다음 시즌 시작. next에는 다음 시즌 데이터가 있는 리그만 들어 있다 (없으면 빈 leagues → 성장 엔진).
 * 월드를 직접 수정하고 보고서를 돌려준다.
 */
export function startNextSeason(w: World, next: SeasonInput): SeasonReport {
  const rng = createRng(w.rng ^ 0x5eed);
  const from = w.season, to = next.season;
  const startDate = seasonStart(to);
  const report: SeasonReport = { from, to, champions: {}, relegated: {}, promoted: {}, retired: [], debuts: [], released: [], updated: 0, aged: 0, userKept: false };
  for (const r of w.history.filter((h) => h.season === from)) report.champions[r.league] = r.champion;

  const nextLeague = new Map(next.leagues.map((l) => [l.id, l]));
  const dataPlayers = new Map<string, { club: string; league: string; sp: (typeof next.leagues)[number]['clubs'][number]['squad'][number] }>();
  for (const lg of next.leagues) for (const c of lg.clubs) for (const sp of c.squad) if (!dataPlayers.has(sp.id)) dataPlayers.set(sp.id, { club: c.club, league: lg.id, sp });

  // ── 리그 구성 (강등 · 승격) ──────────────────────────
  const newMembers: Record<string, string[]> = {};
  for (const [lgId, comp] of Object.entries(w.competitions)) {
    const cur = Object.keys(comp.table);
    const nl = nextLeague.get(lgId);
    if (!nl) { newMembers[lgId] = cur; continue; }   // 데이터 없음 → 같은 구단 유지
    const real = nl.clubs.map((c) => c.club);
    const promoted = real.filter((c) => !cur.includes(c));
    const order = sortTable(comp.table).map((r) => r.club);
    const down: string[] = [];
    for (let i = order.length - 1; i >= 0 && down.length < promoted.length; i--) {
      if (order[i] === w.userClubId) { report.userKept = true; continue; }
      down.push(order[i]);
    }
    newMembers[lgId] = [...cur.filter((c) => !down.includes(c)), ...promoted];
    report.relegated[lgId] = down;
    report.promoted[lgId] = promoted;
    for (const c of down) w.clubs[c].league = `${lgId}-lower`;
  }

  // 승격 구단 생성 (실제 다음 시즌 선수단으로)
  for (const lg of next.leagues) for (const c of lg.clubs) {
    if (!newMembers[lg.id]?.includes(c.club)) continue;
    const existing = w.clubs[c.club];
    if (existing) {
      existing.league = lg.id;
      existing.reputation = c.reputation;
      continue;
    }
    w.clubs[c.club] = {
      id: c.club, league: lg.id, reputation: c.reputation, squad: [],
      tactics: { formation: c.formation && FORMATIONS[c.formation] ? c.formation : '4-4-2', mentality: 0, pressing: 1 },
      finance: { ...c.finance }, lineup: null,
    };
  }

  // 기존 구단: 명성 · 재정은 실제 다음 시즌 값이 있으면 따른다
  for (const lg of next.leagues) for (const c of lg.clubs) {
    const club = w.clubs[c.club];
    if (!club) continue;
    club.reputation = c.reputation;
    if (c.club !== w.userClubId) club.finance = { ...c.finance };
  }

  // ── 선수 ────────────────────────────────────────
  for (const p of Object.values(w.players)) {
    resetSeason(p);
    if (p.retired) continue;
    const age = ageOn(p.birth, startDate);
    const d = dataPlayers.get(p.id);
    if (d) {
      p.base = { ...d.sp.attrs };          // 실제 능력치 (기준선)
      p.pos = d.sp.pos;
      report.updated++;
    } else if (!nextLeague.has(p.clubId ? w.clubs[p.clubId]?.league ?? '' : '')) {
      // 이 선수의 리그에 다음 시즌 데이터가 없으면 성장 · 노화 엔진
      ageAttributes(p, age, rng);
      report.aged++;
    }
    // 은퇴: 다음 시즌 데이터에 없고 나이가 많으면 확률적으로
    if (!d && rng.chance(retireChance(age, Object.values(p.base).reduce((a, b) => a + (b ?? 0), 0) / Math.max(1, Object.keys(p.base).length)))) {
      retire(w, p);
      report.retired.push(p.id);
      continue;
    }
    // 계약 만료: 사용자 구단은 계약 화면이 생기기 전까지 2년 자동 연장, AI 구단은 실제로 남아 있거나 핵심이면 연장
    if (p.clubId && p.contract && p.contract < startDate) {
      const keep = p.clubId === w.userClubId || d?.club === p.clubId || rng.chance(0.55);
      if (keep) p.contract = `${+startDate.slice(0, 4) + 2}-06-30`;
      else { releasePlayer(w, p); report.released.push(p.id); }
    }
  }

  // 미래 선수 등장
  for (const [id, d] of dataPlayers) {
    if (w.players[id]) continue;
    const club = w.clubs[d.club];
    const join = club && newMembers[club.league]?.includes(club.id) && club.squad.length < MAX_SQUAD ? club.id : null;
    const p = newPlayer(d.sp, join, w.seed);
    w.players[id] = p;
    if (join) club!.squad.push(id);
    report.debuts.push(id);
  }

  // 포메이션 다시 확인 (선수단이 바뀌었으니)
  for (const c of Object.values(w.clubs)) {
    if (!FORMATIONS[c.tactics.formation]) c.tactics.formation = guessFormation(c.squad.map((id) => w.players[id]));
    if (c.lineup) c.lineup = { starters: c.lineup.starters.map((id) => (id && c.squad.includes(id) ? id : null)), bench: c.lineup.bench.filter((id) => c.squad.includes(id)) };
  }

  // ── 일정 ────────────────────────────────────────
  for (const [lgId, members] of Object.entries(newMembers)) {
    w.competitions[lgId] = {
      id: lgId, season: to,
      fixtures: buildFixtures(lgId, to, members, rng),
      table: Object.fromEntries(members.map((c) => [c, emptyRow(c)])),
    };
  }

  w.season = to;
  w.date = startDate;
  w.rng = rng.state();
  w.inbox = w.inbox.filter((e) => e.date >= `${from.slice(0, 4)}-07-01`).slice(-100);
  w.inbox.push({ type: 'info', date: startDate, text: `${to.replace('-', '/')} 시즌 시작 · 새로 등장한 선수 ${report.debuts.length}명 · 은퇴 ${report.retired.length}명` });
  if (report.userKept) w.inbox.push({ type: 'info', date: startDate, text: '강등권이었지만 2부 리그가 아직 없어 잔류 처리됐습니다' });
  return report;
}

function retire(w: World, p: PlayerState) {
  if (p.clubId) w.clubs[p.clubId].squad = w.clubs[p.clubId].squad.filter((id) => id !== p.id);
  p.clubId = null;
  p.retired = true;
}

function releasePlayer(w: World, p: PlayerState) {
  if (p.clubId) w.clubs[p.clubId].squad = w.clubs[p.clubId].squad.filter((id) => id !== p.id);
  p.clubId = null;
  p.contract = null;
}

function resetSeason(p: PlayerState) {
  p.stats = emptyStats();
  p.yellowCount = 0;
  p.suspension = 0;
  p.fitness = Math.max(p.fitness, 90);
  p.morale = 60;
  p.recentRatings = [];
  p.sharpness = 60;
  p.benchStreak = 0;
}
