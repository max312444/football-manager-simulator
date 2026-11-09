// 월드 생성과 하루 진행 (advanceDay)
import type { ClubSeasonFile } from '../data/types';
import type { ClubState, Competition, Fixture, GameEvent, Hidden, PlayerState, Tactics, World } from './types';
import { WORLD_VERSION } from './types';
import type { SquadPlayer } from '../data/types';
import { createRng, hashSeed, type Rng } from './rng';
import { buildFixtures, seasonStart } from './fixtures';
import { applyResult, emptyRow, sortTable } from './standings';
import { DEFAULT_FORMATION, FORMATIONS, guessFormation, matchRules } from './squad';
import { createMatch, finalFitness, minutesPlayed, playToEnd, type MatchState } from './match';
import { dailyUpdate } from './condition';
import { initialLoyalty, updatePlaytime } from './loyalty';
import { recommend } from './ai';
import { aiTransferDay } from './transfer';
import { financeDay, gateIncome } from './finance';
import { emptyLog, traitMonth } from './traits';
import type { Lineup } from './squad';

export interface SeasonInput {
  season: string;
  leagues: { id: string; clubs: ClubSeasonFile[] }[];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const addDay = (iso: string, n = 1) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

/** 숨은 속성 생성: 세이브 시드 + 선수 ID 기반 (출처 데이터 아님, 세이브마다 다름) */
export function genHidden(id: string, seed: number): Hidden {
  const r = createRng(hashSeed(id) ^ seed);
  // 평균 10~11, 대부분 6~16
  const v = () => clamp(Math.round(10.5 + r.normal() * 3.2), 1, 20);
  return {
    consistency: v(), bigMatch: v(), professionalism: v(), injuryProne: v(),
    adaptability: v(), ambition: v(), temperament: v(), loyalty: v(),
  };
}

/** 데이터 선수 → 월드 선수 (새 게임 · 다음 시즌 신규 등장 공통) */
export function newPlayer(sp: SquadPlayer, clubId: string | null, seed: number): PlayerState {
  const hidden = genHidden(sp.id, seed);
  return {
    id: sp.id, name: sp.name, birth: sp.birth, nation: sp.nation, pos: sp.pos, number: sp.number,
    clubId, base: { ...sp.attrs }, growth: {}, wage: sp.wage, contract: sp.contract,
    hidden, traits: [],
    fitness: 100, condition: 0, morale: 60, sharpness: 70, recentRatings: [],
    injury: null, suspension: 0, yellowCount: 0, loyalty: initialLoyalty({ hidden }), benchStreak: 0,
    stats: emptyStats(), career: [],
  };
}

export const emptyStats = () => ({ apps: 0, subApps: 0, goals: 0, assists: 0, yellow: 0, red: 0, cleanSheets: 0, ratingSum: 0 });

export function createWorld(input: SeasonInput, userClubId: string, seed: number): World {
  const rng = createRng(seed);
  const players: Record<string, PlayerState> = {};
  const clubs: Record<string, ClubState> = {};
  const competitions: Record<string, Competition> = {};
  const warnings: string[] = [];

  for (const lg of input.leagues) {
    for (const c of lg.clubs) {
      const squad: string[] = [];
      for (const sp of c.squad) {
        if (players[sp.id]) {
          // 같은 시즌 두 구단 소속 (이적시장 마감일 이적 등) → 먼저 들어온 쪽 유지, 경고 기록
          warnings.push(`중복 소속: ${sp.id} (${players[sp.id].clubId} / ${c.club})`);
          continue;
        }
        players[sp.id] = newPlayer(sp, c.club, seed);
        squad.push(sp.id);
      }
      const formation = c.formation && FORMATIONS[c.formation] ? c.formation : guessFormation(squad.map((id) => players[id]));
      clubs[c.club] = {
        id: c.club, league: lg.id, reputation: c.reputation, squad,
        tactics: { formation: formation || DEFAULT_FORMATION, mentality: 0, pressing: 1 },
        finance: { ...c.finance },
      };
    }
    const ids = lg.clubs.map((c) => c.club);
    competitions[lg.id] = {
      id: lg.id, season: input.season,
      fixtures: buildFixtures(lg.id, input.season, ids, rng),
      table: Object.fromEntries(ids.map((id) => [id, emptyRow(id)])),
    };
  }

  return {
    version: WORLD_VERSION, seed, rng: rng.state(), date: seasonStart(input.season), season: input.season, userClubId,
    players, clubs, competitions, inbox: [], warnings, history: [],
  };
}


/** 경기 하나 준비 (사용자 경기는 화면에서 이걸 받아 직접 진행할 수 있음) */
/**
 * 경기 하나 준비. lineups/tactics를 주면 그대로 쓰고(사용자가 확정한 선발),
 * 없으면 AI가 상대에 맞춰 추천한 포메이션 · 성향 · 선발을 쓴다.
 */
export function prepareMatch(w: World, f: Fixture, rng: Rng, opts: { manualSide?: 'home' | 'away'; tactics?: Partial<Record<'home' | 'away', Tactics>>; lineups?: Partial<Record<'home' | 'away', Lineup>> } = {}): MatchState {
  const rules = matchRules(w.season);
  const h = w.clubs[f.home], a = w.clubs[f.away];
  const plan = (side: 'home' | 'away') => {
    const given = opts.lineups?.[side];
    const club = side === 'home' ? f.home : f.away, opp = side === 'home' ? f.away : f.home;
    if (given) return { lineup: given, tactics: { ...w.clubs[club].tactics, ...opts.tactics?.[side], formation: given.formation } };
    const r = recommend(w, club, opp, side === 'home');
    return { lineup: r.lineup, tactics: { ...r.tactics, ...opts.tactics?.[side] } };
  };
  const hp = plan('home'), ap = plan('away');
  return createMatch({
    home: f.home, away: f.away,
    homeLineup: hp.lineup, awayLineup: ap.lineup,
    homeTactics: hp.tactics, awayTactics: ap.tactics, maxSubs: rules.maxSubs,
    bigMatch: h.reputation >= 80 && a.reputation >= 80,
    manualSide: opts.manualSide,
  }, { players: w.players, rng });
}

/** 경기 결과를 월드에 반영 (순위, 선수 기록, 체력, 징계, 사기) */
export function applyMatch(w: World, f: Fixture, m: MatchState) {
  const s = m.summary;
  f.result = s;
  applyResult(w.competitions[f.league].table, f.home, f.away, s.homeGoals, s.awayGoals);
  gateIncome(w, f.home, f.away);
  // 호칭 판정용 기록: 부상 · 막판 동점/결승골 · 강팀전 평점
  const log = (id: string) => (w.players[id].tlog ??= emptyLog());
  for (const inj of s.injuries) log(inj.player).inj++;
  let hg = 0, ag = 0;
  for (const g of [...s.goals].sort((a, b) => a.minute - b.minute)) {
    if (g.side === 'home') hg++; else ag++;
    const diff = g.side === 'home' ? hg - ag : ag - hg;
    if (g.minute >= 75 && (diff === 0 || diff === 1)) log(g.scorer).late++;
  }
  for (const [side, opp] of [['home', f.away], ['away', f.home]] as const) {
    if ((w.clubs[opp]?.reputation ?? 0) < 80) continue;
    for (const id of Object.keys(m[side].played)) { const r = s.ratings[id]; if (r != null) { const l = log(id); l.bigN++; l.bigSum += r; } }
  }

  const fit = finalFitness(m);
  const mins = minutesPlayed(m);
  for (const [id, min] of Object.entries(mins)) {
    const p = w.players[id];
    if (min <= 0) continue;
    const started = m.home.played[id]?.from === 0 || m.away.played[id]?.from === 0;
    if (started) p.stats.apps++; else p.stats.subApps++;
    p.fitness = fit[id] ?? p.fitness;
    p.sharpness = clamp(p.sharpness + (min / 90) * 14, 0, 100);
    const r = s.ratings[id];
    if (r != null) { p.stats.ratingSum += r; p.recentRatings = [...p.recentRatings, r].slice(-5); }
  }
  for (const g of s.goals) {
    w.players[g.scorer].stats.goals++;
    if (g.assist) w.players[g.assist].stats.assists++;
  }
  for (const c of s.cards) {
    const p = w.players[c.player];
    if (c.red) { p.stats.red++; p.suspension += 1; }
    else {
      p.stats.yellow++; p.yellowCount++;
      if (p.yellowCount % 5 === 0) p.suspension += 1;   // 경고 5장마다 1경기 정지 (단순화)
    }
  }
  for (const [side, conceded] of [['home', s.awayGoals], ['away', s.homeGoals]] as const) {
    const t = m[side];
    if (conceded === 0) for (const id of Object.keys(t.played)) {
      const p = w.players[id];
      if ((mins[id] ?? 0) >= 60 && ['GK', 'CB', 'LB', 'RB', 'LWB', 'RWB'].includes(p.pos)) p.stats.cleanSheets++;
    }
    // 결과에 따른 사기 변화 (선수단 전체)
    const diff = side === 'home' ? s.homeGoals - s.awayGoals : s.awayGoals - s.homeGoals;
    const delta = diff > 0 ? 4 : diff === 0 ? 0 : -4;
    for (const id of w.clubs[t.clubId].squad) w.players[id].morale = clamp(w.players[id].morale + delta, 0, 100);
  }
  // 출전 시간 → 충성도 (징계 소진 전에: 경기 시작 때 징계 중이던 선수를 제외하기 위해)
  const started = new Set([...Object.entries(m.home.played), ...Object.entries(m.away.played)].filter(([, pl]) => pl.from === 0).map(([id]) => id));
  updatePlaytime(w, [f.home, f.away], mins, started);

  // 이번 경기에 징계로 못 뛴 선수: 정지 1경기 소진
  for (const club of [f.home, f.away]) for (const id of w.clubs[club].squad) {
    const p = w.players[id];
    if (p.suspension > 0 && !(id in mins)) p.suspension--;
  }
}

/**
 * 하루 진행. 오늘 경기를 모두 치르고, 선수 컨디션을 갱신한 뒤 날짜를 하루 넘긴다.
 * 월드를 직접 수정한다 (화면 쪽은 새 참조로 감싸서 갱신).
 */
export function advanceDay(w: World): GameEvent[] {
  const rng = createRng(w.rng);
  const events: GameEvent[] = [];
  const today = w.date;
  const playedToday = new Set<string>();

  for (const comp of Object.values(w.competitions)) {
    for (const f of comp.fixtures) {
      if (f.date !== today || f.result) continue;
      const m = prepareMatch(w, f, rng);
      playToEnd(m, { players: w.players, rng });
      applyMatch(w, f, m);
      for (const t of [m.home, m.away]) for (const id of Object.keys(t.played)) playedToday.add(id);
      const user = f.home === w.userClubId || f.away === w.userClubId;
      events.push({ type: 'match', date: today, fixtureId: f.id, league: f.league, home: f.home, away: f.away, score: [m.summary.homeGoals, m.summary.awayGoals], user });
      for (const inj of m.summary.injuries) {
        const p = w.players[inj.player];
        events.push({ type: 'injury', date: today, player: p.id, club: p.clubId ?? '', days: p.injury?.days ?? 0, label: p.injury?.label ?? '' });
      }
    }
    if (!comp.fixtures.some((f) => !f.result) && !w.inbox.some((e) => e.type === 'seasonEnd' && e.league === comp.id)) {
      events.push({ type: 'seasonEnd', date: today, league: comp.id, champion: sortTable(comp.table)[0].club });
    }
  }

  // 이적시장: AI 구단 이적 (기간이 아니면 아무것도 안 함)
  events.push(...aiTransferDay(w, rng));
  events.push(...traitMonth(w, rng));

  // 컨디션 (오늘 뛴 선수는 경기 후 체력 그대로, 회복은 내일부터)
  const recent = recentPlayers(w, today);
  for (const p of Object.values(w.players)) {
    if (playedToday.has(p.id)) continue;
    dailyUpdate(p, today, rng, recent.has(p.id));
  }

  financeDay(w);
  w.date = addDay(today);
  w.rng = rng.state();
  // 받은편지함에는 사용자 구단 관련과 시즌 종료만 남긴다
  for (const e of events) {
    if (e.type === 'seasonEnd' || e.type === 'info' || (e.type === 'match' && e.user) || (e.type === 'injury' && e.club === w.userClubId)
      || (e.type === 'transfer' && (e.user || e.fee >= 30e6))) w.inbox.push(e);
  }
  if (w.inbox.length > 300) w.inbox.splice(0, w.inbox.length - 300);
  return events;
}

/** 최근 3일 안에 경기를 뛴 선수 (일정 밀도) */
function recentPlayers(w: World, today: string): Set<string> {
  const out = new Set<string>();
  const from = addDay(today, -3);
  for (const comp of Object.values(w.competitions)) for (const f of comp.fixtures) {
    if (!f.result || f.date < from || f.date > today) continue;
    for (const id of Object.keys(f.result.ratings)) out.add(id);
  }
  return out;
}

/** 모든 리그 일정이 끝났는지 */
export const seasonOver = (w: World) => Object.values(w.competitions).every((c) => c.fixtures.every((f) => f.result));

/** 다음 이벤트(사용자 경기 등)까지 진행 — "계속" 버튼 */
export function advanceUntilEvent(w: World, maxDays = 60): GameEvent[] {
  const all: GameEvent[] = [];
  for (let i = 0; i < maxDays && !seasonOver(w); i++) {
    const ev = advanceDay(w);
    all.push(...ev);
    if (ev.some((e) => (e.type === 'match' && e.user) || e.type === 'seasonEnd' || (e.type === 'injury' && e.club === w.userClubId))) break;
  }
  return all;
}

/** 오늘 사용자 구단의 (아직 안 치른) 경기 */
export function userFixtureToday(w: World): Fixture | null {
  for (const comp of Object.values(w.competitions)) {
    const f = comp.fixtures.find((x) => x.date === w.date && !x.result && (x.home === w.userClubId || x.away === w.userClubId));
    if (f) return f;
  }
  return null;
}

/** 사용자 구단의 다음 경기 (오늘 포함) */
export function nextUserFixture(w: World): Fixture | null {
  let best: Fixture | null = null;
  for (const comp of Object.values(w.competitions)) for (const f of comp.fixtures) {
    if (f.result || (f.home !== w.userClubId && f.away !== w.userClubId)) continue;
    if (!best || f.date < best.date) best = f;
  }
  return best;
}

/**
 * "계속": 사용자 경기 날이 될 때까지 하루씩 진행한다 (그 경기는 치르지 않고 멈춤).
 * 시즌 종료·사용자 선수 부상이 생겨도 멈춘다.
 */
export function advanceToUserMatch(w: World, maxDays = 120): { events: GameEvent[]; matchToday: Fixture | null } {
  const events: GameEvent[] = [];
  for (let i = 0; i < maxDays; i++) {
    const f = userFixtureToday(w);
    if (f) return { events, matchToday: f };
    if (seasonOver(w)) break;
    const ev = advanceDay(w);
    events.push(...ev);
    if (ev.some((e) => e.type === 'seasonEnd' || (e.type === 'injury' && e.club === w.userClubId))) break;
  }
  return { events, matchToday: userFixtureToday(w) };
}
