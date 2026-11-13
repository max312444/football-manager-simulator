// 시즌 전환: 지난 시즌 마감 → 다음 시즌 준비
//
// 규칙 (설계서 5.6)
//  - 능력치는 실제를 따른다: 다음 시즌 데이터에 있는 선수는 기준선(base)을 그 시즌 값으로 갱신. 육성 보정(growth)은 유지
//  - 소속은 게임 세계를 따른다: 게임 속 구단을 유지 (실제로 이적했어도 그대로)
//  - 미래 선수: 다음 시즌 데이터에 처음 나오는 선수는 실제 소속 구단으로 등장. 그 구단이 리그에 없거나 꽉 찼으면 FA
//  - 데이터가 끝난 뒤(2026/27~): 나이에 따른 성장 · 노화 엔진
//  - 강등 · 승격: 실제 다음 시즌에 새로 올라온 구단 수만큼 게임 순위 하위 구단을 내린다
//    (2부 리그는 아직 없음 → 사용자 구단이 강등권이면 잔류 처리하고 그 위 구단을 내림)
import { coachSeasonEnd } from './coaches';
import { assignManagers, managerSeasonGrowth } from './managers';
import { teamStrength } from './ai';
import { endLoans } from './loan';
import { joinPrecontract } from './bosman';
import { fixRelClauses, triggerRelClauses } from './firesale';
import type { AttrKey } from '../data/types';
import type { ClubState, PlayerState, RetireNews, SeasonRecord, World } from './types';
import type { SeasonInput } from './world';
import { emptyStats, newPlayer } from './world';
import { buildFixtures, seasonStart } from './fixtures';
import { emptyRow, sortTable } from './standings';
import { createRng, type Rng } from './rng';
import { managerNewSeason, managerSeasonEnd } from './manager';
import { applyBudgetFactor } from './board';
import { boardNewSeason, fansSeasonEnd } from './boardEvents';
import { ageOn } from './condition';
import { FORMATIONS, guessFormation } from './squad';
import { boardReview, book, clubRevenue, prizeMoney, seasonBudgets } from './finance';
import { traitSeasonEnd } from './traits';
import { overall } from './ratings';
import { levelOf, pairRule, PAIRS, poolOf } from './pyramid';
import { cleanOffers } from './transfer';
import { money } from '../ui/format';
import { seasonAwards } from './awards';
import { createCups } from './cup';
import { academyFill, growTowardPotential, youthIntake } from './youth';
import { createEurope } from './europe';
import { clearWorldCup, createWorldCup } from './worldcup';

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
  /** 시즌 전환 때 내 구단을 떠난 선수 (은퇴 · 계약 만료) */
  userLeft: { player: string; why: 'retire' | 'release' }[];
  updated: number;       // 실제 데이터로 능력치가 갱신된 선수 수
  aged: number;          // 성장 엔진으로 바뀐 선수 수
  userKept: boolean;     // 사용자 구단이 강등권이었지만 잔류 처리됐는지
  /** 이사회 예산 배정 결과 */
  board?: { net: number; prize: number; transferBudget: number; wageBudget: number; balance: number };
  /** 유스 입단 (데이터가 끝난 뒤) */
  youth?: import('./youth').YouthIntake[];
  /** 선수단 구성이 모자라 아카데미에서 끌어올린 선수 */
  academy?: import('./youth').YouthIntake[];
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
    p.career.push({ season: w.season, club: p.clubId, apps, goals: p.stats.goals, assists: p.stats.assists, rating: apps ? Math.round((p.stats.ratingSum / apps) * 100) / 100 : null,
      ...(p.cupStats?.apps ? { cupApps: p.cupStats.apps, cupGoals: p.cupStats.goals } : {}) });
  }
  // 시즌 수상 (보상 포함)
  const awards = seasonAwards(w);
  for (const r of recs) r.awards = awards.filter((a) => a.league === r.league);
  // 플레이가 끊긴 호칭 정리
  w.lostTraits = traitSeasonEnd(w, createRng((w.rng ^ 0x5eed) >>> 0));
  // 리그 상금 (모든 구단, 순위별)
  w.lastPrize = 0;
  for (const r of recs) r.table.forEach((row, i) => {
    const amount = prizeMoney(w, row.club, i + 1, r.table.length);
    if (row.club === w.userClubId) w.lastPrize = amount;
  });
  w.history.push(...recs);
  const mres = managerSeasonEnd(w, recs);   // 감독: 신뢰도 · 명성 (시즌 끝에 경질 판정)
  if (mres) fansSeasonEnd(w, mres);         // 팬 여론 · 우승 보너스 예약
  managerSeasonGrowth(w, recs, (id) => (w.clubs[id] ? teamStrength(w, id) : 0));   // 감독 성장 · 하락 (기대보다 잘하면 잠재력까지)
  w.inbox.push(...coachSeasonEnd(w, recs, createRng((w.rng ^ 0xc0ac) >>> 0)).filter((e) => e.type === 'coach' && e.news));   // AI 구단 감독 교체
  return recs;
}

/** 데이터가 끝난 뒤의 성장 · 노화 (시즌 1회) */
function ageAttributes(p: PlayerState, age: number, rng: Rng) {
  const physical: AttrKey[] = ['pac', 'sta', 'str'];
  const minutesBonus = Math.min(1, (p.career.at(-1)?.apps ?? 0) / 25);
  // 게임이 만든 유망주: 잠재력을 향해 성장 (25세 무렵 도달)
  if (growTowardPotential(p, age, minutesBonus, rng)) return;
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
  // 월드컵이 있었으면 경기용 대표팀 구단 · 가상 선수 정리 (기록은 worldCupHistory)
  clearWorldCup(w);
  w.inbox.push(...endLoans(w).filter((e) => e.type === 'loan' && e.user));   // 임대 종료: 복귀 · 완전 영입 옵션
  const rng = createRng(w.rng ^ 0x5eed);
  const from = w.season, to = next.season;
  const startDate = seasonStart(to);
  const report: SeasonReport = { from, to, champions: {}, relegated: {}, promoted: {}, retired: [], debuts: [], released: [], userLeft: [], updated: 0, aged: 0, userKept: false };
  for (const r of w.history.filter((h) => h.season === from)) report.champions[r.league] = r.champion;

  const nextLeague = new Map(next.leagues.map((l) => [l.id, l]));
  const dataPlayers = new Map<string, { club: string; league: string; sp: (typeof next.leagues)[number]['clubs'][number]['squad'][number] }>();
  for (const lg of next.leagues) for (const c of lg.clubs) for (const sp of c.squad) if (!dataPlayers.has(sp.id)) dataPlayers.set(sp.id, { club: c.club, league: lg.id, sp });

  // ── 리그 구성 (승격 · 강등) ──────────────────────────
  // 1부 · 2부가 모두 게임에 있으면 게임 순위와 플레이오프 결과로 정한다 (실제와 달라도 게임 세계를 따름).
  // 리그 크기는 실제 다음 시즌 데이터가 있으면 거기에 맞춘다. 2부에서 떨어진 구단은 대기(3부, 경기 없음)로 가고,
  // 2부 빈자리는 실제 데이터의 3부 승격 구단, 없으면 대기 구단 중 명성 순으로 채운다.
  const newMembers: Record<string, string[]> = {};
  const prevLevel = new Map(Object.values(w.clubs).map((c) => [c.id, levelOf(c.league)]));
  const handled = new Set<string>();
  const byRep = (ids: string[]) => [...ids].sort((a, b) => (w.clubs[b]?.reputation ?? 0) - (w.clubs[a]?.reputation ?? 0));
  fixRelClauses(w);   // 강등 조항: 리그가 바뀌기 전에 정해 둔다
  for (const [nation, [top, second]] of Object.entries(PAIRS)) {
    const T = w.competitions[top];
    if (!T) continue;
    handled.add(top);
    const rule = pairRule(nation, from);
    const S = w.competitions[second];
    const realTop = nextLeague.get(top)?.clubs.map((c) => c.club);
    const realSecond = nextLeague.get(second)?.clubs.map((c) => c.club);
    const topCur = Object.keys(T.table);
    const topOrder = sortTable(T.table).map((r) => r.club);

    if (S) {
      handled.add(second);
      const secCur = Object.keys(S.table);
      const secOrder = sortTable(S.table).map((r) => r.club);
      const up = secOrder.slice(0, rule.up);
      const down = topOrder.slice(topOrder.length - rule.topDown);
      const po = S.playoff;
      if (rule.barrage) {
        const b = po?.barrage;
        if (b && b.winner === b.challenger) { up.push(b.challenger); down.push(b.top); }
      } else if (rule.playoff) up.push(po?.winner ?? secOrder[rule.up]);
      // 1부 크기 맞추기
      const tSize = realTop?.length ?? topCur.length;
      let topNext = [...topCur.filter((c) => !down.includes(c)), ...up];
      while (topNext.length > tSize) { const c = [...topOrder].reverse().find((x) => topNext.includes(x))!; topNext = topNext.filter((x) => x !== c); down.push(c); }
      for (const c of secOrder) { if (topNext.length >= tSize) break; if (!topNext.includes(c)) { topNext.push(c); up.push(c); } }
      // 2부: 아래로 떨어질 구단 (내 구단은 3부가 없어 잔류)
      const rest = secOrder.filter((c) => !up.includes(c));
      const sDown: string[] = [];
      for (let i = rest.length - 1; i >= 0 && sDown.length < rule.secondDown; i--) {
        if (rest[i] === w.userClubId) { report.userKept = true; continue; }
        sDown.push(rest[i]);
      }
      let secNext = [...secCur.filter((c) => !up.includes(c) && !sDown.includes(c)), ...down];
      const sSize = realSecond?.length ?? secCur.length;
      const fromReal = realSecond ? realSecond.filter((c) => !topCur.includes(c) && !secCur.includes(c)) : [];
      const fromPool = byRep(Object.values(w.clubs).filter((c) => c.league === poolOf(second) && !fromReal.includes(c.id)).map((c) => c.id));
      const fromBelow: string[] = [];
      for (const c of [...fromReal, ...fromPool]) { if (secNext.length >= sSize) break; secNext.push(c); fromBelow.push(c); }
      while (secNext.length > sSize) {
        const c = [...secOrder].reverse().find((x) => secNext.includes(x) && x !== w.userClubId && !down.includes(x));
        if (!c) break;
        secNext = secNext.filter((x) => x !== c); sDown.push(c);
      }
      newMembers[top] = topNext; newMembers[second] = secNext;
      for (const c of up) w.clubs[c].league = top;
      for (const c of down) w.clubs[c].league = second;
      for (const c of sDown) w.clubs[c].league = poolOf(second);
      for (const c of fromBelow) if (w.clubs[c]) w.clubs[c].league = second;
      report.promoted[top] = up; report.relegated[top] = down;
      report.promoted[second] = fromBelow; report.relegated[second] = sDown;
      continue;
    }

    // 2부가 아직 게임에 없음: 1부는 실제 다음 시즌 승격 구단 수만큼 아래에서 강등
    if (!realTop) { newMembers[top] = topCur; continue; }
    const promoted = realTop.filter((c) => !topCur.includes(c));
    const down: string[] = [];
    for (let i = topOrder.length - 1; i >= 0 && down.length < promoted.length; i--) {
      // 내려갈 2부가 없으면 내 구단은 잔류
      if (topOrder[i] === w.userClubId && !realSecond) { report.userKept = true; continue; }
      down.push(topOrder[i]);
    }
    const topNext = [...topCur.filter((c) => !down.includes(c)), ...promoted];
    newMembers[top] = topNext;
    report.promoted[top] = promoted; report.relegated[top] = down;
    for (const c of promoted) if (w.clubs[c]) w.clubs[c].league = top;
    if (realSecond) {
      // 이번 시즌부터 2부 리그 시작: 실제 2부 구단 + 게임에서 강등된 구단, 크기는 실제에 맞춤
      handled.add(second);
      let secNext = [...new Set([...down, ...realSecond.filter((c) => !topNext.includes(c))])];
      while (secNext.length > realSecond.length) { const c = [...secNext].reverse().find((x) => !down.includes(x)); if (!c) break; secNext = secNext.filter((x) => x !== c); }
      newMembers[second] = secNext;
      for (const c of down) w.clubs[c].league = second;
      for (const c of secNext) if (w.clubs[c]) w.clubs[c].league = second;
    } else for (const c of down) w.clubs[c].league = `${top}-lower`;
  }
  for (const [lgId, comp] of Object.entries(w.competitions)) if (!handled.has(lgId) && !newMembers[lgId]) newMembers[lgId] = Object.keys(comp.table);

  // 새로 들어오는 구단 만들기 (실제 다음 시즌 데이터로)
  const dataClub = new Map(next.leagues.flatMap((lg) => lg.clubs.map((c) => [c.club, { lg: lg.id, c }] as const)));
  for (const [lgId, members] of Object.entries(newMembers)) for (const id of members) {
    const existing = w.clubs[id];
    if (existing) { existing.league = lgId; continue; }
    const d = dataClub.get(id);
    if (!d) continue;
    w.clubs[id] = {
      id, league: lgId, reputation: d.c.reputation, squad: [],
      tactics: { formation: d.c.formation && FORMATIONS[d.c.formation] ? d.c.formation : '4-4-2', mentality: 0, pressing: 1 },
      finance: { ...d.c.finance }, lineup: null,
    };
  }
  for (const [lgId, members] of Object.entries(newMembers)) newMembers[lgId] = members.filter((id) => w.clubs[id]);
  // 시설 · 경기장: 실제 다음 시즌 데이터가 있으면 갱신
  for (const [id, { c }] of dataClub) if (w.clubs[id]) { w.clubs[id].facilities = c.facilities ? { training: Math.max(c.facilities.training, w.clubs[id].built?.training ?? 0), youth: Math.max(c.facilities.youth, w.clubs[id].built?.youth ?? 0) } : w.clubs[id].facilities; w.clubs[id].stadium = c.stadiumCapacity ?? w.clubs[id].stadium; }

  // 명성 · 재정: 실제 다음 시즌 값이 있으면 따르되, 게임 속 리그 수준이 실제와 다르면 보정
  //  (1단계 올라가면 명성 +4 · 재정 ×2, 내려가면 명성 −5 · 재정 ×0.45)
  // 재정: 잔고는 게임 속 돈을 그대로 이어가고, 매출 · 예산 기준은 실제 다음 시즌 데이터(없으면 지금 값)를 따른다.
  //  리그 수준이 데이터와 다르면 (승격 · 강등) 1단계마다 매출 · 예산 ×2 또는 ×0.45. 모든 구단 같은 규칙 (seasonBudgets)
  const adjust = (fin: ClubState['finance'], steps: number): ClubState['finance'] => {
    if (!steps) return fin;
    const f = steps > 0 ? 2 ** steps : 0.45 ** -steps;
    return { ...fin, transferBudget: Math.round(fin.transferBudget * f), wageBudget: Math.round(fin.wageBudget * f), ...(fin.revenue ? { revenue: Math.round(fin.revenue * f) } : {}) };
  };
  for (const club of Object.values(w.clubs)) {
    const d = dataClub.get(club.id);
    const baseLevel = d ? levelOf(d.lg) : prevLevel.get(club.id) ?? levelOf(club.league);
    const steps = baseLevel - levelOf(club.league);    // 양수 = 실제(또는 지난 시즌)보다 위 리그
    if (d || steps) {
      const rep = (d ? d.c.reputation : club.reputation) + (steps > 0 ? 4 * steps : 5 * steps);
      club.reputation = Math.max(30, Math.min(99, rep));
    }
    // 강등 임금 삭감 조항: 지난 시즌보다 아래 리그로 내려가면 선수 주급 40% 삭감 (실제 계약의 강등 조항처럼, 모든 구단 같음)
    if (levelOf(club.league) > (prevLevel.get(club.id) ?? levelOf(club.league)))
      for (const id of club.squad) w.players[id].wage = Math.max(500, Math.round((w.players[id].wage * 0.6) / 500) * 500);
    // 현금을 무한정 쌓지 않는다: 잔고가 연 매출의 60% 를 넘으면 넘는 돈의 60% 는 구단주 배당 · 부채 상환 (모든 구단 같은 규칙)
    const rev = clubRevenue(w, club.id);
    if (w.competitions[club.league] && club.finance.balance > rev * 0.6) book(w, club.id, 'owner', Math.round((club.finance.balance - rev * 0.6) * 0.6));
    const fin = adjust(d ? d.c.finance : club.finance, steps);
    club.sales = 0;   // 재정 규정의 판매 수입은 시즌마다 새로
    if (club.id !== w.userClubId) seasonBudgets(club, fin);
    else report.board = { ...boardReview(w, fin, to), prize: w.lastPrize ?? 0 };
  }
  // 강등 조항 발동: 1부에서 떨어진 구단 선수 → 여름 이적시장 급매물
  triggerRelClauses(w, Object.values(w.clubs).filter((c) => prevLevel.get(c.id) === 1 && levelOf(c.league) > 1).map((c) => c.id), to);

  // ── 선수 ────────────────────────────────────────
  const news: RetireNews[] = [];
  // 구단 안 능력 순위 (시즌 전환 전 기준): 계약 만료로 떠나는 핵심 선수 소식용
  const rankOf = new Map<string, number>();
  for (const c of Object.values(w.clubs)) c.squad.map((id) => w.players[id]).sort((a, b) => overall(b) - overall(a)).forEach((p, i) => rankOf.set(p.id, i + 1));
  for (const p of Object.values(w.players)) {
    resetSeason(p);
    p.alt = undefined;   // 보조 포지션은 새 능력치로 다시 정한다
    if (p.retired) continue;
    const age = ageOn(p.birth, startDate);
    const d = dataPlayers.get(p.id);
    if (d) {
      p.base = { ...d.sp.attrs };          // 실제 능력치 (기준선)
      p.pos = d.sp.pos;
      p.dataAlt = d.sp.alt?.length ? d.sp.alt : undefined;
      if (d.sp.foot) p.foot = d.sp.foot;
      // AI 구단: 실제로도 같은 구단에 남아 있고 실제 주급이 더 높으면 실제 재계약 반영 (내 구단 선수는 직접 재계약)
      if (p.clubId && p.clubId !== w.userClubId && d.club === p.clubId && d.sp.wage > p.wage) {
        p.wage = d.sp.wage;
        if (d.sp.contract && (!p.contract || d.sp.contract > p.contract)) p.contract = d.sp.contract;
      }
      report.updated++;
    } else if (!nextLeague.has(p.clubId ? w.clubs[p.clubId]?.league ?? '' : '')) {
      // 이 선수의 리그에 다음 시즌 데이터가 없으면 성장 · 노화 엔진
      ageAttributes(p, age, rng);
      report.aged++;
    }
    // 은퇴: 다음 시즌 데이터에 없고 나이가 많으면 확률적으로
    // 자유계약으로 시즌을 넘긴 선수: 29세 이상 · 또는 22세 이상이면서 능력 62 미만이면 은퇴 (FA 가 끝없이 쌓이지 않게)
    const faDone = !p.clubId && !d && (age >= 29 || (age >= 22 && overall(p) < 62));
    if (faDone || (!d && rng.chance(retireChance(age, Object.values(p.base).reduce((a, b) => a + (b ?? 0), 0) / Math.max(1, Object.keys(p.base).length))))) {
      // 은퇴 소식: 내 구단 선수 · 스타 선수 (전성기 능력 82 이상, 수상 경력, 레전드 호칭)
      const ovr = overall(p);
      const mine = p.clubId === w.userClubId;
      if (mine || Math.max(ovr, p.peak ?? 0) >= 82 || p.honours?.length || p.traits.includes('legend')) {
        news.push({ player: p.id, club: p.clubId, season: from, ovr, mine });
        w.inbox.push({ type: 'retire', date: startDate, player: p.id, club: p.clubId, season: from });
      }
      if (mine) report.userLeft.push({ player: p.id, why: 'retire' });
      retire(w, p);
      report.retired.push(p.id);
      continue;
    }
    if (p.precontract && p.clubId && p.contract && p.contract < startDate) {
      // 보스만 사전 계약: 계약이 끝나 새 구단으로 (이적료 없음)
      const from = p.clubId, ovr = overall(p);
      const ev = joinPrecontract(w, p);
      if (ev && from === w.userClubId) report.userLeft.push({ player: p.id, why: 'release' });
      if (ev && (from === w.userClubId || p.clubId === w.userClubId)) w.inbox.push({ ...ev, date: startDate });
      else if (ev && ovr >= 82) w.inbox.push({ ...ev, date: startDate });
      if (ev) continue;
    }
    p.precontract = undefined;
    if (p.clubId && p.contract && p.contract < startDate) {
      // 내 구단은 재계약하지 않았으면 떠난다 (자동 연장 없음). AI 구단은 실제로 남아 있거나 확률로 연장
      // AI: 실제로 남아 있으면 연장, 아니면 핵심 선수(구단 능력 18위 안 · 32세 이하)는 85%, 나머지 40% 확률로 연장
      const core = (rankOf.get(p.id) ?? 99) <= 18 && age <= 32;
      const keep = p.clubId !== w.userClubId && (d?.club === p.clubId || rng.chance(core ? 0.85 : 0.4));
      if (keep) p.contract = `${+startDate.slice(0, 4) + 2}-06-30`;
      else {
        const mine = p.clubId === w.userClubId, ovr = overall(p);
        if (mine) report.userLeft.push({ player: p.id, why: 'release' });
        // 내 선수 · 다른 팀 핵심 선수 (팀 내 능력 3위 안 · 능력 78 이상, 또는 능력 82 이상) 는 소식으로
        if (mine || ovr >= 82 || (ovr >= 78 && (rankOf.get(p.id) ?? 99) <= 3)) {
          news.push({ kind: 'leave', player: p.id, club: p.clubId, season: from, ovr, mine });
          w.inbox.push({ type: 'leave', date: startDate, player: p.id, club: p.clubId });
        }
        releasePlayer(w, p);
        report.released.push(p.id);
      }
    }
  }

  // 내 선수 먼저, 그다음 능력 높은 순 · 최대 8명
  // 팀을 떠난 선수 먼저, 그다음 은퇴. 각각 내 선수 먼저 · 능력 높은 순 · 최대 8명
  const order = (xs: RetireNews[]) => xs.sort((a, b) => +b.mine - +a.mine || b.ovr - a.ovr).slice(0, 8);
  w.pendingNews = [...order(news.filter((n) => n.kind === 'leave')), ...order(news.filter((n) => n.kind !== 'leave'))];

  // 미래 선수 등장
  for (const [id, d] of dataPlayers) {
    if (w.players[id]) continue;
    const club = w.clubs[d.club];
    const join = club && newMembers[club.league]?.includes(club.id) && club.squad.length < MAX_SQUAD ? club.id : null;
    const p = newPlayer(d.sp, join, w.seed, to);
    w.players[id] = p;
    if (join) club!.squad.push(id);
    report.debuts.push(id);
  }

  // 유스 입단: 다음 시즌 실제 데이터가 없는 리그의 구단 (데이터가 있으면 실제 신인이 등장하므로)
  const youthClubs = Object.values(w.clubs).filter((c) => newMembers[c.league]?.includes(c.id) && !nextLeague.has(c.league));
  report.youth = youthIntake(w, youthClubs, to, MAX_SQUAD);
  // 선수단 구성이 모자란 구단은 아카데미에서 끌어올림 (실제 데이터 시즌 포함)
  report.academy = academyFill(w, Object.values(w.clubs).filter((c) => newMembers[c.league]?.includes(c.id)), to);
  const myYouth = report.youth.find((y) => y.club === w.userClubId);
  if (myYouth) {
    const best = myYouth.players.map((id) => w.players[id]).sort((a, b) => (b.potential ?? 0) - (a.potential ?? 0))[0];
    w.inbox.push({ type: 'youth', date: startDate, players: myYouth.players, star: (best.potential ?? 0) >= 78 ? best.id : undefined });
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

  // 유럽 대회 (방금 끝난 시즌 순위로) · 국내 컵 대회 (새 리그 구성으로)
  w.europe = createEurope(w, rng);
  w.cups = createCups(w, rng);
  // 월드컵 (이번 시즌 끝에 열리면): 실제 참가국 · 조가 있으면 그대로, 없으면 대표팀 전력 + 대륙 쿼터
  w.worldCup = createWorldCup(w, to, next.worldCups);

  // 실제 다음 시즌 데이터에 내 구단이 없으면 현재 예산을 기준으로 배정
  if (!report.board) report.board = { ...boardReview(w, { ...w.clubs[w.userClubId].finance }, to), prize: w.lastPrize ?? 0 };
  w.season = to;
  // 월드컵이 7월까지 이어졌으면 날짜를 되돌리지 않는다
  w.date = w.date > startDate ? w.date : startDate;
  cleanOffers(w);   // 떠난 · 은퇴한 선수에게 온 제안 정리
  w.rng = rng.state();
  w.inbox = w.inbox.filter((e) => e.date >= `${from.slice(0, 4)}-07-01`).slice(-100);
  w.inbox.push({ type: 'info', date: startDate, text: `${to.replace('-', '/')} 시즌 시작 · 새로 등장한 선수 ${report.debuts.length}명 · 은퇴 ${report.retired.length}명` });
  if (report.board) w.inbox.push({ type: 'info', date: startDate, text: `이사회 예산 배정 · 이적 예산 ${money(report.board.transferBudget)} · 주급 예산 ${money(report.board.wageBudget)}/주` });
  if (report.userKept) w.inbox.push({ type: 'info', date: startDate, text: '강등권이었지만 2부 리그가 아직 없어 잔류 처리됐습니다' });
  // AI 구단 감독: 실제 다음 시즌 데이터가 있으면 그 감독으로 (없는 구단은 지금 감독 그대로)
  if (next.managers) assignManagers(w, next.managers, to, createRng((w.rng ^ 0x7a11) >>> 0));
  // 감독: 경질 · 계약 만료면 새 구단 고르기
  const mrng = createRng((w.rng ^ 0x3a9e) >>> 0);
  w.inbox.push(...managerNewSeason(w, mrng));
  if (!w.manager?.pendingJob) w.inbox.push(...applyBudgetFactor(w), ...boardNewSeason(w, mrng));   // 이사회 관계에 따라 예산 ±15% · 우승 보너스 · 구단주 교체
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
  p.amort = undefined;
  p.amortEnd = undefined;
}

function resetSeason(p: PlayerState) {
  p.stats = emptyStats();
  p.cupStats = undefined;
  p.intlStats = undefined;
  p.tlog = undefined;
  p.yellowCount = 0;
  p.suspension = 0;
  p.fitness = Math.max(p.fitness, 90);
  p.morale = 60;
  p.recentRatings = [];
  p.sharpness = 60;
  p.benchStreak = 0;
}
