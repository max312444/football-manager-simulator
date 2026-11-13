// 스폰서: 수입 규모 유지 · 봄 제안 · 계약 · 자동 계약 · 성과 보너스 · 성적 반영 · AI 갱신
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createWorld, type SeasonInput } from './world';
import { createRng } from './rng';
import { clubRevenue, SHARE } from './finance';
import { ensureSponsors, makeOffers, monthlyCommercial, signSponsor, sponsorDay, sponsorSeasonEnd } from './sponsors';
import type { SeasonRecord } from './types';
import type { ClubSeasonFile, LeagueSeasonFile } from '../data/types';

const DATA = path.resolve(__dirname, '../../../data-public');
const load = (season: string, ids: string[]): SeasonInput => ({ season, leagues: ids.map((id) => { const dir = path.join(DATA, 'seasons', season, id); const meta: LeagueSeasonFile = JSON.parse(fs.readFileSync(path.join(dir, '_league.json'), 'utf8')); return { id, clubs: meta.clubs.map((c) => JSON.parse(fs.readFileSync(path.join(dir, `${c}.json`), 'utf8')) as ClubSeasonFile) }; }) });
const LIV = 'c83d96l';

describe('스폰서', () => {
  it('매월 수입은 예전(매출 25% / 12)과 같은 규모', () => {
    const w = createWorld(load('2025-26', ['eng1']), LIV, 61);
    for (const c of Object.values(w.clubs).slice(0, 6)) {
      const old = (clubRevenue(w, c.id) * SHARE.commercial) / 12;
      expect(monthlyCommercial(w, c, 1) / old).toBeGreaterThan(0.97);
      expect(monthlyCommercial(w, c, 1) / old).toBeLessThan(1.03);
    }
  });

  it('내 구단: 3월 1일 제안 3개 · 고르면 계약 · 안 고르면 6월 25일 고정형 자동', () => {
    const w = createWorld(load('2025-26', ['eng1']), LIV, 62);
    const c = w.clubs[LIV];
    const shirt = ensureSponsors(w, c).find((d) => d.slot === 'shirt')!;
    expect(shirt.until).toBe('2026-06-30');   // 첫 시즌 끝 만료
    w.date = '2026-02-28';
    expect(sponsorDay(w, createRng(1))).toEqual([]);
    w.date = '2026-03-01';
    const ev = sponsorDay(w, createRng(1));
    expect(ev[0]).toMatchObject({ type: 'sponsor', kind: 'offers', slot: 'shirt' });
    expect(w.sponsorOffers!.map((o) => o.kind)).toEqual(['fixed', 'bonus', 'long']);
    expect(sponsorDay(w, createRng(2))).toEqual([]);   // 다시 안 옴
    const bonusOffer = w.sponsorOffers!.find((o) => o.kind === 'bonus')!;
    expect(bonusOffer.bonus?.title).toBeGreaterThan(0);
    signSponsor(w, bonusOffer.id);
    expect(c.sponsors!.find((d) => d.slot === 'shirt')!.name).toBe(bonusOffer.name);
    expect(w.sponsorOffers).toEqual([]);
    // 자동 계약: 새 세계에서 안 고르고 기한 지남
    const w2 = createWorld(load('2025-26', ['eng1']), LIV, 63);
    w2.date = '2026-03-01'; sponsorDay(w2, createRng(1));
    const fixed = w2.sponsorOffers!.find((o) => o.kind === 'fixed')!;
    w2.date = '2026-06-25';
    const ev2 = sponsorDay(w2, createRng(1));
    expect(ev2[0]).toMatchObject({ kind: 'auto', name: fixed.name });
    expect(w2.clubs[LIV].sponsors!.find((d) => d.slot === 'shirt')!.until).toBe('2029-06-30');
  });

  it('성적이 좋으면 제안 금액 ↑ · 성과형 보너스는 우승하면 지급', () => {
    const w = createWorld(load('2025-26', ['eng1']), LIV, 64);
    const t = w.competitions.eng1.table;
    const ids = Object.keys(t);
    const setPos = (first: boolean) => ids.forEach((id, i) => { t[id].p = 20; t[id].pts = id === LIV ? (first ? 99 : 0) : 40 + i; });
    setPos(true);
    const good = makeOffers(w, 'shirt', createRng(5))[0].value;
    setPos(false);
    const bad = makeOffers(w, 'shirt', createRng(5))[0].value;
    console.log('메인 스폰서 고정형 제안 · 1위', good, '/ 꼴찌', bad);
    expect(good).toBeGreaterThan(bad * 1.25);
    // 보너스: 성과형 계약 후 우승
    const c = w.clubs[LIV];
    c.sponsors = [{ slot: 'shirt', name: 'X', value: 1e7, until: '2028-06-30', kind: 'bonus', bonus: { title: 3e6, top4: 1e6 } }];
    const bal = c.finance.balance;
    const table = [LIV, ...ids.filter((x) => x !== LIV)].map((club) => ({ club }));
    const ev = sponsorSeasonEnd(w, [{ season: w.season, league: 'eng1', champion: LIV, table } as unknown as SeasonRecord]);
    expect(ev[0]).toMatchObject({ kind: 'bonus', amount: 4e6 });
    expect(c.finance.balance - bal).toBe(4e6);
  });

  it('AI 구단: 만료 계약은 시즌 끝에 자동 갱신', () => {
    const w = createWorld(load('2025-26', ['eng1']), LIV, 65);
    const ai = Object.values(w.clubs).find((c) => c.id !== LIV)!;
    const d = ensureSponsors(w, ai)[0];
    d.until = '2026-06-30';
    sponsorSeasonEnd(w, []);
    expect(d.until > '2026-06-30').toBe(true);
  });
});
