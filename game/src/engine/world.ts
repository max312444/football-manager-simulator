// 월드 생성과 하루 진행 (advanceDay)
import { autoResolve } from './autoResolve';
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
import { aiTransferDay, canAfford, completeTransfer, wageDemand } from './transfer';
import { financeDay, gateIncome } from './finance';
import { emptyLog, traitMonth } from './traits';
import { managerDay } from './manager';
import { boardMonth } from './board';
import { boardEventDay } from './boardEvents';
import { pressDay } from './press';
import { aiSagaDay, sagaDay } from './saga';
import { scandalDay } from './scandal';
import { facilityDay, facilityLevel } from './facilities';
import type { Lineup } from './squad';
import { boostMonth, matchFans } from './awards';
import { contractCheck } from './contract';
import { playoffDay } from './pyramid';
import { createCups, cupDay, shootout } from './cup';
import { createEurope, euroDay, onEuroResult } from './europe';
import { createWorldCup, onWorldCupResult, worldCupDay } from './worldcup';
import { intlBreakDay } from './national';
import { effectiveTraining, recoveryFactor, trainingInjuryChance, trainingMonth } from './training';

export interface SeasonInput {
  season: string;
  leagues: { id: string; clubs: ClubSeasonFile[] }[];
  /** 실제 지난 시즌 최종 순위 (리그별, 첫 시즌 유럽 대회 출전권용) */
  prevStandings?: Record<string, string[]>;
  /** 실제 월드컵 참가국 · 조 (meta/worldcups.json) */
  worldCups?: Record<string, import('./worldcup').WorldCupMeta>;
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
export function newPlayer(sp: SquadPlayer, clubId: string | null, seed: number, season?: string): PlayerState {
  const hidden = genHidden(sp.id, seed);
  const gen = !sp.contract && !!clubId && !!season;
  return {
    id: sp.id, name: sp.name, birth: sp.birth, nation: sp.nation, pos: sp.pos, number: sp.number,
    clubId, base: { ...sp.attrs }, growth: {}, wage: sp.wage, contract: gen ? genContract(sp, season!, seed) : sp.contract,
    ...(gen ? { contractGen: true } : {}),
    hidden, traits: [],
    fitness: 100, condition: 0, morale: 60, sharpness: 70, recentRatings: [],
    injury: null, suspension: 0, yellowCount: 0, loyalty: initialLoyalty({ hidden }), benchStreak: 0,
    stats: emptyStats(), career: [],
  };
}

/**
 * 데이터에 계약 정보가 없는 소속 선수: 게임이 남은 계약 기간을 정한다 (세이브 시드 기반, 실제 계약 아님)
 * 젊을수록 길게 (1~5년), 33세 이상은 1~2년
 */
function genContract(sp: { id: string; birth: string }, season: string, seed: number): string {
  const r = createRng(hashSeed(sp.id + ':contract') ^ seed);
  const age = +season.slice(0, 4) - +sp.birth.slice(0, 4);
  const max = age <= 23 ? 5 : age <= 28 ? 4 : age <= 32 ? 3 : 2;
  return `${+season.slice(0, 4) + r.int(1, max)}-06-30`;
}

/** 예전 세이브: 계약 정보가 없는 소속 선수에게 계약을 정해 준다 */
export function fillContracts(w: World): void {
  for (const p of Object.values(w.players)) if (p.clubId && !p.contract && !p.retired) { p.contract = genContract(p, w.season, w.seed); p.contractGen = true; }
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
        players[sp.id] = newPlayer(sp, c.club, seed, input.season);
        squad.push(sp.id);
      }
      const formation = c.formation && FORMATIONS[c.formation] ? c.formation : guessFormation(squad.map((id) => players[id]));
      clubs[c.club] = {
        id: c.club, league: lg.id, reputation: c.reputation, squad,
        tactics: { formation: formation || DEFAULT_FORMATION, mentality: 0, pressing: 1 },
        finance: { ...c.finance },
        facilities: c.facilities, stadium: c.stadiumCapacity ?? undefined,
      };
    }
    const ids = lg.clubs.map((c) => c.club);
    competitions[lg.id] = {
      id: lg.id, season: input.season,
      fixtures: buildFixtures(lg.id, input.season, ids, rng),
      table: Object.fromEntries(ids.map((id) => [id, emptyRow(id)])),
    };
  }

  const w: World = {
    version: WORLD_VERSION, seed, rng: 0, date: seasonStart(input.season), season: input.season, userClubId,
    players, clubs, competitions, inbox: [], warnings, history: [],
  };
  w.europe = createEurope(w, rng, input.prevStandings);
  w.cups = createCups(w, rng);
  w.worldCup = createWorldCup(w, input.season, input.worldCups);
  w.rng = rng.state();
  return w;
}

/** 리그 · 컵 대회의 모든 경기 */
export function allFixtures(w: World): Fixture[] {
  const out: Fixture[] = [];
  for (const c of Object.values(w.competitions)) out.push(...c.fixtures);
  for (const c of Object.values(w.cups ?? {})) out.push(...c.fixtures);
  for (const c of Object.values(w.europe ?? {})) out.push(...c.fixtures);
  if (w.worldCup) out.push(...w.worldCup.fixtures);
  return out;
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
  const cup = f.stage === 'cup' || f.stage === 'euro' || f.stage === 'intl';   // 컵 · 유럽 · 국가대표: 순위표 · 경고 누적 제외
  // 기록: 컵 · 유럽 대회는 cupStats, 월드컵은 intlStats (리그 기록 stats 와 따로)
  const cs = (id: string) => (f.stage === 'intl' ? (w.players[id].intlStats ??= { apps: 0, goals: 0, assists: 0 }) : (w.players[id].cupStats ??= { apps: 0, goals: 0, assists: 0 }));
  // 컵 경기는 비기면 바로 승부차기
  if (f.stage === 'cup' && s.homeGoals === s.awayGoals) s.pens = shootout(w, f.home, f.away, f.id);
  f.result = s;
  if (f.stage === 'euro') onEuroResult(w, f);
  if (f.stage === 'intl') onWorldCupResult(w, f);
  if (!f.stage) applyResult(w.competitions[f.league].table, f.home, f.away, s.homeGoals, s.awayGoals);
  gateIncome(w, f.home, f.away);
  matchFans(w, f.home, f.away, s.homeGoals, s.awayGoals);
  if (s.pom) { const p = w.players[s.pom]; if (!cup) p.stats.pom = (p.stats.pom ?? 0) + 1; p.morale = Math.min(100, p.morale + 5); }
  if (s.worst && s.worst !== s.pom) { const p = w.players[s.worst]; p.morale = Math.max(0, p.morale - 3); }
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
    if (cup) cs(id).apps++;
    else if (started) p.stats.apps++; else p.stats.subApps++;
    p.fitness = fit[id] ?? p.fitness;
    p.sharpness = clamp(p.sharpness + (min / 90) * 14, 0, 100);
    const r = s.ratings[id];
    if (r != null) { if (!cup) p.stats.ratingSum += r; p.recentRatings = [...p.recentRatings, r].slice(-5); }
  }
  for (const g of s.goals) {
    if (cup) {
      cs(g.scorer).goals++;
      if (g.assist) cs(g.assist).assists++;
      continue;
    }
    w.players[g.scorer].stats.goals++;
    if (g.assist) w.players[g.assist].stats.assists++;
  }
  for (const c of s.cards) {
    const p = w.players[c.player];
    if (c.red) { if (!cup) p.stats.red++; p.suspension += 1; }
    else if (cup) continue;   // 컵 경고는 리그 누적에 넣지 않음
    else {
      p.stats.yellow++; p.yellowCount++;
      if (p.yellowCount % 5 === 0) p.suspension += 1;   // 경고 5장마다 1경기 정지 (단순화)
    }
  }
  for (const [side, conceded] of [['home', s.awayGoals], ['away', s.homeGoals]] as const) {
    const t = m[side];
    if (conceded === 0 && !cup) for (const id of Object.keys(t.played)) {
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
  // 국가대표 경기는 구단 충성도 · 구단 징계와 관계없다
  if (f.stage === 'intl') return;
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

  for (const f of allFixtures(w)) {
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

  // 승격 · 승강 플레이오프 대진 (정규 시즌이 끝난 리그)
  playoffDay(w);
  // 컵 대회: 끝난 라운드 정리 · 다음 라운드 추첨 · 우승
  events.push(...cupDay(w));
  events.push(...euroDay(w));
  // 월드컵 · A매치 기간 차출
  events.push(...worldCupDay(w));
  events.push(...intlBreakDay(w, rng));
  // 리그 종료 (플레이오프까지 모두 끝난 리그)
  for (const comp of Object.values(w.competitions)) {
    if (!comp.fixtures.some((f) => !f.result) && !w.inbox.some((e) => e.type === 'seasonEnd' && e.league === comp.id && e.date >= seasonStart(comp.season))) {
      events.push({ type: 'seasonEnd', date: today, league: comp.id, champion: sortTable(comp.table)[0].club });
    }
  }

  // 이적시장: AI 구단 이적 (기간이 아니면 아무것도 안 함)
  events.push(...aiTransferDay(w, rng));
  events.push(...traitMonth(w, rng));
  events.push(...managerDay(w, rng));
  events.push(...facilityDay(w));   // 시설 공사 완료
  boardMonth(w);   // 이사회 관계: 성적에 따라 조금씩   // 감독: 신뢰도 · 재계약 · 다른 구단 제안 · 경질
  // 훈련 · 선수 육성 (매달 1일)
  trainingMonth(w, rng);

  // 컨디션 (오늘 뛴 선수는 경기 후 체력 그대로, 회복은 내일부터). 훈련 강도에 따라 회복 속도 · 훈련 중 부상
  const recent = recentPlayers(w, today);
  for (const p of Object.values(w.players)) {
    if (playedToday.has(p.id)) continue;
    const club = p.clubId ? w.clubs[p.clubId] : null;
    const t = club ? effectiveTraining(club) : null;
    dailyUpdate(p, today, rng, recent.has(p.id), t && club ? recoveryFactor(t, facilityLevel(club, 'training')) : 1);
    if (t && club && w.competitions[club.league] && !p.injury && rng.chance(trainingInjuryChance(t, p.hidden.injuryProne))) {
      const days = rng.int(4, 21);
      p.injury = { days, label: '훈련 중 부상' };
      events.push({ type: 'injury', date: today, player: p.id, club: club.id, days, label: '훈련 중 부상' });
    }
  }

  events.push(...boardEventDay(w, events, rng));   // 팬 여론 · 이사회 이벤트
  const sagas = sagaDay(w, rng);   // 선수 언론 플레이 (연봉 요구 · 이적 요청 · 태업)
  events.push(...sagas);
  events.push(...aiSagaDay(w, rng, (p, to, fee) => {
    const wage = Math.max(p.wage, wageDemand(w, p));
    if (!canAfford(w, to, fee, wage, 4)) return false;
    events.push(completeTransfer(w, p, to, fee, wage, 4));
    return true;
  }));
  const prompt = sagas.find((e) => e.type === 'saga' && e.step !== 'resolved');
  if (prompt && prompt.type === 'saga') w.sagaPrompt = prompt.player;
  events.push(...scandalDay(w, rng));   // 선수 논란
  events.push(...pressDay(w, events, rng, nextUserFixture(w)));   // 기자회견
  events.push(...autoResolve(w, rng));   // 설정에서 끈 팝업은 무난하게 자동 처리
  financeDay(w);
  boostMonth(w);
  contractCheck(w);
  w.date = addDay(today);
  w.rng = rng.state();
  // 받은편지함에는 사용자 구단 관련과 시즌 종료만 남긴다
  for (const e of events) {
    if (e.type === 'seasonEnd' || e.type === 'info' || (e.type === 'match' && e.user) || (e.type === 'injury' && e.club === w.userClubId)
      || (e.type === 'transfer' && (e.user || e.fee >= 30e6))
      || (e.type === 'cup' && (e.club === w.userClubId || e.result === 'champion'))
      || e.type === 'callup' || e.type === 'manager' || e.type === 'board' || e.type === 'press' || e.type === 'saga' || e.type === 'scandal' || (e.type === 'worldcup' && (e.result === 'champion' || !!e.players?.length))) w.inbox.push(e);
  }
  if (w.inbox.length > 300) w.inbox.splice(0, w.inbox.length - 300);
  return events;
}

/** 최근 3일 안에 경기를 뛴 선수 (일정 밀도) */
function recentPlayers(w: World, today: string): Set<string> {
  const out = new Set<string>();
  const from = addDay(today, -3);
  for (const f of allFixtures(w)) {
    if (!f.result || f.date < from || f.date > today) continue;
    for (const id of Object.keys(f.result.ratings)) out.add(id);
  }
  return out;
}

/** 모든 리그 · 컵 일정이 끝났는지 */
export const seasonOver = (w: World) => allFixtures(w).every((f) => f.result)
  && Object.values(w.cups ?? {}).every((c) => c.winner) && Object.values(w.europe ?? {}).every((c) => c.winner) && (!w.worldCup || !!w.worldCup.winner);

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
  return allFixtures(w).find((x) => x.date === w.date && !x.result && (x.home === w.userClubId || x.away === w.userClubId)) ?? null;
}

/** 사용자 구단의 다음 경기 (오늘 포함) */
export function nextUserFixture(w: World): Fixture | null {
  let best: Fixture | null = null;
  for (const f of allFixtures(w)) {
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
    const had = !!w.pendingRenewals?.length;
    const ev = advanceDay(w);
    events.push(...ev);
    if (ev.some((e) => e.type === 'seasonEnd' || (e.type === 'injury' && e.club === w.userClubId))) break;
    if (!had && w.pendingRenewals?.length) break;   // 재계약 요청이 새로 오면 멈춰서 팝업
    if (w.manager?.pendingJob) break;   // 경질 · 계약 만료: 새 구단 고르기
    if (ev.some((e) => e.type === 'board' && w.manager?.boardEvent)) break;   // 이사회 이벤트: 멈춰서 선택
    if (ev.some((e) => e.type === 'press') && w.manager?.press) break;   // 기자회견: 멈춰서 답변
    if (w.sagaPrompt || w.scandalPrompt) break;   // 선수 언론 플레이 · 논란: 멈춰서 대응
  }
  return { events, matchToday: userFixtureToday(w) };
}
