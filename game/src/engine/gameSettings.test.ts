// 설정 (팝업 빈도 · 끄기 자동 처리 · 난이도) 테스트
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createWorld, type SeasonInput } from './world';
import { ensureManager, managerDay } from './manager';
import { scandalDay } from './scandal';
import { autoResolve } from './autoResolve';
import { costLimit } from './rules';
import { evaluateBid } from './transfer';
import { overall } from './ratings';
import { createRng } from './rng';
import type { ClubSeasonFile, LeagueSeasonFile } from '../data/types';

const DATA = path.resolve(__dirname, '../../../data-public');
const load = (season: string, ids: string[]): SeasonInput => ({
  season, leagues: ids.map((id) => {
    const dir = path.join(DATA, 'seasons', season, id);
    const meta: LeagueSeasonFile = JSON.parse(fs.readFileSync(path.join(dir, '_league.json'), 'utf8'));
    return { id, clubs: meta.clubs.map((c) => JSON.parse(fs.readFileSync(path.join(dir, `${c}.json`), 'utf8')) as ClubSeasonFile) };
  }),
});
const LIV = 'c83d96l';
const fresh = () => { const w = createWorld(load('2025-26', ['eng1']), LIV, 9); ensureManager(w); return w; };

describe('설정', () => {
  it('팝업 빈도: 자주 > 보통 > 드물게 (선수 논란)', () => {
    const count = (f: 'rare' | 'normal' | 'often') => {
      const w = fresh();
      w.settings = { popups: { scandal: f } };
      for (const id of w.clubs[LIV].squad) w.players[id].hidden = { ...w.players[id].hidden, temperament: 6, professionalism: 6 };
      let n = 0;
      for (let s = 1; s <= 400; s++) { w.scandalPrompt = undefined; w.lastScandal = undefined; w.date = '2025-10-08'; n += scandalDay(w, createRng(s)).length; }
      return n;
    };
    const r = count('rare'), m = count('normal'), o = count('often');
    console.log('논란: 드물게', r, '보통', m, '자주', o);
    expect(o).toBeGreaterThan(m);
    expect(m).toBeGreaterThan(r);
  });

  it('끄기: 생긴 논란 · 선수 요구는 무난하게 자동 처리되고 창이 남지 않는다', () => {
    const w = fresh();
    w.settings = { popups: { scandal: 'off', saga: 'off' } };
    const p = w.players[w.clubs[LIV].squad[0]];
    w.scandalPrompt = { player: p.id, kind: 'late', date: w.date };
    p.saga = { kind: 'wage', stage: 1, since: w.date, next: '2099-01-01', wantWage: p.wage * 2, club: LIV };
    w.sagaPrompt = p.id;
    const ev = autoResolve(w, createRng(1));
    expect(w.scandalPrompt).toBeUndefined();
    expect(w.sagaPrompt).toBeUndefined();
    expect(ev.some((e) => e.type === 'info' && e.text.startsWith('(자동 처리)'))).toBe(true);
  });

  it('이사회 인내심: 엄격하면 같은 신뢰도에서 경질, 너그러우면 버팀', () => {
    const run = (patience: 'lenient' | 'strict') => {
      const w = fresh();
      w.settings = { patience };
      const m = ensureManager(w);
      const t = w.competitions.eng1.table;
      Object.keys(t).forEach((c, i) => Object.assign(t[c], { p: 10, pts: 60 - i }));
      Object.assign(t[LIV], { p: 10, pts: 70 });   // 1위 (신뢰도 소폭 상승)
      m.confidence = 12;
      w.date = '2025-11-01';
      managerDay(w, createRng(1));
      return !!m.pendingJob;
    };
    expect(run('strict')).toBe(true);
    expect(run('lenient')).toBe(false);
  });

  it('재정 규정 · 이적 협상 난이도는 내 구단에만', () => {
    const w = fresh();
    const other = Object.keys(w.clubs).find((c) => c !== LIV)!;
    const base = costLimit(w, LIV).limit, otherBase = costLimit(w, other).limit;
    w.settings = { rules: 'relaxed' };
    expect(costLimit(w, LIV).limit).toBeCloseTo(base * 1.15);
    expect(costLimit(w, other).limit).toBeCloseTo(otherBase);
    const seller = w.clubs[other];
    const p = seller.squad.map((id) => w.players[id]).sort((a, b) => overall(a) - overall(b))[0];
    w.settings = {};
    const ask = evaluateBid(w, p, LIV, 1).ask;
    w.settings = { transfers: 'hard' };
    expect(evaluateBid(w, p, LIV, 1).ask).toBeCloseTo(ask * 1.15);
  });
});
