import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { advanceDay, createWorld, seasonOver, type SeasonInput } from './world';
import { closeSeason, startNextSeason } from './season';
import { applyRenewal, evaluateRenewal, renewDemand, seasonEnd } from './contract';
import type { ClubSeasonFile, LeagueSeasonFile } from '../data/types';

const DATA = path.resolve(__dirname, '../../../data-public');
const LIVERPOOL = 'c83d96l';
function loadSeason(season: string, league = 'eng1'): SeasonInput {
  const dir = path.join(DATA, 'seasons', season, league);
  const meta: LeagueSeasonFile = JSON.parse(fs.readFileSync(path.join(dir, '_league.json'), 'utf8'));
  return { season, leagues: [{ id: league, clubs: meta.clubs.map((c) => JSON.parse(fs.readFileSync(path.join(dir, `${c}.json`), 'utf8')) as ClubSeasonFile) }] };
}

describe('재계약 · 계약 만료', () => {
  it('주급이 낮으면 거절, 원하는 주급이면 재계약', () => {
    const w = createWorld(loadSeason('2025-26'), LIVERPOOL, 3);
    const p = w.clubs[LIVERPOOL].squad.map((id) => w.players[id]).find((x) => !x.unhappy)!;
    p.loyalty = 70; p.morale = 70;
    const d = renewDemand(w, p);
    const low = evaluateRenewal(w, p, d * 0.5, 2);
    expect(low.ok).toBe(false);
    expect(low.low).toBe(true);
    expect(evaluateRenewal(w, p, d, 2).ok).toBe(true);
    applyRenewal(w, p, d, 2);
    expect(p.contract).toBe('2027-06-30');
  });

  it('1월 1일: 불만 없는 선수는 자동 재계약, 불만 있는 선수는 요청 → 협상 안 하면 떠나고 제안도 정리', () => {
    const w = createWorld(loadSeason('2025-26'), LIVERPOOL, 4);
    const squad = w.clubs[LIVERPOOL].squad.map((id) => w.players[id]);
    for (const p of squad) if (p.contract! <= seasonEnd(w)) p.contract = '2028-06-30';   // 다른 만료 선수 제외
    const [a, b] = squad.slice(3, 5);
    a.contract = seasonEnd(w); b.contract = seasonEnd(w);
    let day = 0;
    while (!seasonOver(w)) {
      // a 는 계속 불만 (출전 불만 · 낮은 충성도), b 는 만족
      a.unhappy = true; a.loyalty = 20; b.unhappy = false; b.loyalty = 80; b.morale = 75;
      advanceDay(w); day++;
      if (w.date === '2026-01-02') {   // 1월 1일 처리가 끝난 뒤
        expect(w.pendingRenewals?.map((x) => x.player)).toEqual([a.id]);
        expect(b.contract! > seasonEnd(w)).toBe(true);
        console.log('자동 재계약', b.name, b.contract, '· 요청', a.name, w.pendingRenewals![0].reason);
        w.pendingRenewals = undefined;
      }
    }
    expect(w.inbox.some((e) => e.type === 'renewed' && e.players.includes(b.id))).toBe(true);
    // a 에게 온 제안 (시즌 전환 뒤 남으면 안 됨)
    w.offers = [{ id: 'o', player: a.id, from: 'c1xrbb1t', fee: 1e7, max: 2e7, tries: 0, date: w.date, expires: '2026-07-30' }];
    closeSeason(w);
    const r = startNextSeason(w, { season: '2026-27', leagues: [] });
    if (!a.retired) {
      expect(a.clubId).toBeNull();
      expect(r.userLeft.some((x) => x.player === a.id && x.why === 'release')).toBe(true);
    }
    expect(b.retired || b.clubId === LIVERPOOL).toBe(true);
    expect(w.offers).toHaveLength(0);
  }, 60000);
});
