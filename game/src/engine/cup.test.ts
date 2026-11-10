// 국내 컵 대회 테스트: 1부만 있을 때 (20팀 → 예비 라운드) · 1+2부 (임시 2부, 44팀) · 시즌 전환
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { advanceDay, allFixtures, createWorld, seasonOver, type SeasonInput } from './world';
import { closeSeason, startNextSeason } from './season';
import { cupDates, roundPrize } from './cup';
import type { ClubSeasonFile, LeagueSeasonFile } from '../data/types';

const DATA = path.resolve(__dirname, '../../../data-public');
function clubsOf(season: string, league: string): ClubSeasonFile[] {
  const dir = path.join(DATA, 'seasons', season, league);
  const meta: LeagueSeasonFile = JSON.parse(fs.readFileSync(path.join(dir, '_league.json'), 'utf8'));
  return meta.clubs.map((c) => JSON.parse(fs.readFileSync(path.join(dir, `${c}.json`), 'utf8')) as ClubSeasonFile);
}
const run = (w: ReturnType<typeof createWorld>) => { let n = 0; while (!seasonOver(w) && n++ < 400) advanceDay(w); return n; };
const LIV = 'c83d96l';

describe('국내 컵 대회', () => {
  it('1부만 (20팀): 예비 라운드 4경기 → 16강 → 결승, 하루 두 경기 없음, 우승 · 상금', () => {
    const w = createWorld({ season: '2024-25', leagues: [{ id: 'eng1', clubs: clubsOf('2024-25', 'eng1') }] }, LIV, 7);
    const cup = w.cups!['eng-cup'];
    expect(cup.entrants).toHaveLength(20);
    expect(cup.dates).toHaveLength(5);
    expect(cup.rounds[0].name).toBe('예비 라운드');
    expect(cup.rounds[0].ties).toHaveLength(4);
    expect(cup.rounds[0].byes).toHaveLength(12);
    // 상위 시드(명성 높은 구단)는 부전승
    const top12 = [...cup.entrants].sort((a, b) => w.clubs[b].reputation - w.clubs[a].reputation).slice(0, 12);
    expect(new Set(cup.rounds[0].byes)).toEqual(new Set(top12));
    // 리그 경기 앞뒤 하루를 피한 날짜
    const lg = new Set(w.competitions.eng1.fixtures.map((f) => f.date));
    for (const d of cup.dates) expect(lg.has(d)).toBe(false);

    run(w);
    expect(seasonOver(w)).toBe(true);
    expect(cup.winner).toBeTruthy();
    expect(cup.rounds.map((r) => r.name)).toEqual(['예비 라운드', '16강', '8강', '준결승', '결승']);
    expect(cup.fixtures).toHaveLength(4 + 8 + 4 + 2 + 1);
    // 한 구단이 같은 날 두 경기를 하지 않는다
    const seen = new Set<string>();
    for (const f of allFixtures(w)) for (const c of [f.home, f.away]) { const k = `${c}@${f.date}`; expect(seen.has(k)).toBe(false); seen.add(k); }
    // 비긴 컵 경기는 승부차기 승자가 있다
    for (const f of cup.fixtures) if (f.result!.homeGoals === f.result!.awayGoals) expect(f.result!.pens).toBeTruthy();
    // 리그 순위표에는 컵 경기가 안 들어간다
    expect(Object.values(w.competitions.eng1.table).every((r) => r.p === 38)).toBe(true);
    // 우승 기록 · 수상 경력
    expect(w.cupHistory).toEqual([{ season: '2024-25', cup: 'eng-cup', winner: cup.winner, runnerUp: cup.runnerUp }]);
    expect(Object.values(w.players).some((p) => p.honours?.some((h) => h.kind === 'cup'))).toBe(true);
    // 컵 기록은 리그 기록과 따로
    const scorers = Object.values(w.players).filter((p) => (p.cupStats?.goals ?? 0) > 0);
    expect(scorers.length).toBeGreaterThan(0);
    const leagueGoals = Object.values(w.players).reduce((s, p) => s + p.stats.goals, 0);
    const tableGoals = Object.values(w.competitions.eng1.table).reduce((s, r) => s + r.gf, 0);
    expect(leagueGoals).toBe(tableGoals);
    console.log('우승', cup.winner, '준우승', cup.runnerUp, '· 결승 상금', roundPrize(cup, 4), '· 일정', cup.dates.join(' '));
  });

  it('1+2부 (44팀): 예비 라운드 24팀 · 2부가 홈 · 다음 시즌 새 컵', () => {
    const weaker = clubsOf('2024-25', 'esp1').map((c) => ({ ...c, reputation: c.reputation - 15 }));
    const extra = clubsOf('2024-25', 'ita1').map((c) => ({ ...c, reputation: c.reputation - 20 })).slice(0, 4);
    const inp = (s: string): SeasonInput => ({ season: s, leagues: [{ id: 'eng1', clubs: clubsOf(s, 'eng1') }, { id: 'eng2', clubs: [...weaker, ...extra] }] });
    const w = createWorld(inp('2024-25'), LIV, 3);
    const cup = w.cups!['eng-cup'];
    expect(cup.entrants).toHaveLength(44);
    expect(cup.rounds[0].ties).toHaveLength(12);   // 44 - 32 = 12경기
    // 예비 라운드는 하위 시드 24팀 = 모두 2부
    for (const t of cup.rounds[0].ties) for (const c of [t.home, t.away]) expect(w.clubs[c].league).toBe('eng2');
    run(w);
    expect(cup.winner).toBeTruthy();
    // 리그가 다른 대결 (결승 제외)은 2부 구단이 홈
    for (const r of cup.rounds.slice(0, -1)) for (const t of r.ties) {
      const lh = w.clubs[t.home].league, la = w.clubs[t.away].league;
      if (lh !== la) expect(lh).toBe('eng2');
    }
    closeSeason(w);
    startNextSeason(w, { season: '2025-26', leagues: [{ id: 'eng1', clubs: clubsOf('2025-26', 'eng1') }] });
    const next = w.cups!['eng-cup'];
    expect(next.season).toBe('2025-26');
    expect(next.entrants.length).toBeGreaterThanOrEqual(40);
    expect(Object.values(w.players).every((p) => !p.cupStats)).toBe(true);
  }, 60000);

  it('일정: 리그 경기가 많아 빈 수요일이 모자라도 라운드 수만큼 날짜를 만든다', () => {
    const all = new Set<string>();
    for (let d = Date.UTC(2024, 7, 1); d < Date.UTC(2025, 5, 30); d += 86400000) all.add(new Date(d).toISOString().slice(0, 10));
    expect(cupDates('2024-25', 6, all)).toHaveLength(6);
  });
});
