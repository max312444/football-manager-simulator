// 승강제 엔진 테스트: 실제 2부 데이터가 오기 전이라 다른 리그 구단으로 임시 2부를 만든다
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { advanceDay, createWorld, seasonOver, type SeasonInput } from './world';
import { closeSeason, startNextSeason } from './season';
import { sortTable } from './standings';
import { poolOf } from './pyramid';
import type { ClubSeasonFile, LeagueSeasonFile } from '../data/types';

const DATA = path.resolve(__dirname, '../../../data-public');
function clubsOf(season: string, league: string): ClubSeasonFile[] {
  const dir = path.join(DATA, 'seasons', season, league);
  const meta: LeagueSeasonFile = JSON.parse(fs.readFileSync(path.join(dir, '_league.json'), 'utf8'));
  return meta.clubs.map((c) => JSON.parse(fs.readFileSync(path.join(dir, `${c}.json`), 'utf8')) as ClubSeasonFile);
}
/** top = 실제 1부, second = 다른 나라 1부 구단으로 만든 임시 2부 (능력치를 낮춰 2부답게) */
function input(season: string, top: string, second: string, fake: string): SeasonInput {
  const weaker = clubsOf(season, fake).map((c) => ({
    ...c, reputation: c.reputation - 15,
    squad: c.squad.map((p) => ({ ...p, attrs: Object.fromEntries(Object.entries(p.attrs).map(([k, v]) => [k, Math.max(20, (v ?? 50) - 10)])) })),
  })) as ClubSeasonFile[];
  return { season, leagues: [{ id: top, clubs: clubsOf(season, top) }, { id: second, clubs: weaker }] };
}
const run = (w: ReturnType<typeof createWorld>) => { let n = 0; while (!seasonOver(w) && n++ < 400) advanceDay(w); return n; };

describe('승강제 · 플레이오프', () => {
  it('잉글랜드: 3팀 강등, 2팀 자동 승격 + 3~6위 플레이오프 승자', () => {
    const w = createWorld(input('2024-25', 'eng1', 'eng2', 'esp1'), 'c83d96l', 21);
    run(w);
    const S = w.competitions.eng2;
    const po = S.fixtures.filter((f) => f.stage);
    expect(po.filter((f) => f.stage === 'semi')).toHaveLength(4);
    expect(po.filter((f) => f.stage === 'final')).toHaveLength(1);
    expect(S.playoff?.winner).toBeTruthy();
    expect(w.inbox.some((e) => e.type === 'seasonEnd' && e.league === 'eng2')).toBe(true);
    // 플레이오프 경기는 순위표에 안 들어간다 (팀당 정규 경기 수 그대로)
    expect(Object.values(S.table).every((r) => r.p === (Object.keys(S.table).length - 1) * 2)).toBe(true);

    const secOrder = sortTable(S.table).map((r) => r.club);
    const topOrder = sortTable(w.competitions.eng1.table).map((r) => r.club);
    closeSeason(w);
    const r = startNextSeason(w, input('2025-26', 'eng1', 'eng2', 'esp1'));
    console.log('승격', r.promoted.eng1, '(PO', S.playoff?.winner, ') · 강등', r.relegated.eng1, '· 2부→대기', r.relegated.eng2, '· 대기/3부→2부', r.promoted.eng2);
    expect(r.promoted.eng1).toEqual([secOrder[0], secOrder[1], S.playoff!.winner]);
    expect(r.relegated.eng1).toEqual(topOrder.slice(-3));
    expect(Object.keys(w.competitions.eng1.table)).toHaveLength(20);
    expect(Object.keys(w.competitions.eng2.table)).toHaveLength(20);
    for (const c of r.relegated.eng1) expect(w.clubs[c].league).toBe('eng2');
    for (const c of r.relegated.eng2) expect(w.clubs[c].league).toBe(poolOf('eng2'));
    // 강등 구단은 명성 하락
    const down = r.relegated.eng1[0];
    expect(w.clubs[down].reputation).toBeLessThan(clubsOf('2025-26', 'eng1').find((c) => c.club === down)?.reputation ?? 99);
  }, 120000);

  it('독일: 2팀 강등 · 2팀 승격 + 16위 vs 2부 3위 승강 플레이오프', () => {
    const w = createWorld(input('2024-25', 'ger1', 'ger2', 'fra1'), 'c83d96l' in {} ? '' : clubsOf('2024-25', 'ger1')[0].club, 22);
    run(w);
    const S = w.competitions.ger2;
    const b = S.fixtures.filter((f) => f.stage === 'barrage');
    expect(b).toHaveLength(2);
    const topOrder = sortTable(w.competitions.ger1.table).map((r) => r.club);
    expect(S.playoff?.barrage?.top).toBe(topOrder[15]);
    closeSeason(w);
    const r = startNextSeason(w, input('2025-26', 'ger1', 'ger2', 'fra1'));
    console.log('승강 PO', S.playoff?.barrage, '· 승격', r.promoted.ger1, '· 강등', r.relegated.ger1);
    expect(r.relegated.ger1.length).toBe(S.playoff!.barrage!.winner === S.playoff!.barrage!.top ? 2 : 3);
    expect(Object.keys(w.competitions.ger1.table)).toHaveLength(18);
  }, 120000);

  it('내 구단이 1부에서 강등되면 2부에서 다음 시즌을 시작한다', () => {
    const inp = input('2024-25', 'eng1', 'eng2', 'esp1');
    const weakest = [...inp.leagues[0].clubs].sort((a, b) => a.reputation - b.reputation)[0].club;
    const w = createWorld(inp, weakest, 23);
    run(w);
    const last = sortTable(w.competitions.eng1.table).map((r) => r.club).slice(-3);
    closeSeason(w);
    const r = startNextSeason(w, input('2025-26', 'eng1', 'eng2', 'esp1'));
    console.log('내 구단', weakest, '최종', sortTable(w.history.at(-2)!.table.reduce((o, x) => ({ ...o, [x.club]: x }), {})).findIndex((x) => x.club === weakest) + 1, '위 →', w.clubs[weakest].league, '· 이사회', r.board);
    expect(w.clubs[weakest].league).toBe(last.includes(weakest) ? 'eng2' : 'eng1');
    expect(r.userKept).toBe(false);
  }, 120000);
});
