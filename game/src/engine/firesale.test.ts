// 급매물 (강제 매각 · 강등 조항) 테스트
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createWorld, type SeasonInput } from './world';
import { closeSeason, startNextSeason } from './season';
import { overall } from './ratings';
import { evaluateBid, marketValue } from './transfer';
import { bargainDay, bargainOf, overLimit, relClauseOf } from './firesale';
import { createRng } from './rng';
import type { ClubSeasonFile, LeagueSeasonFile } from '../data/types';

const DATA = path.resolve(__dirname, '../../../data-public');
const LIV = 'c83d96l';
const load = (season: string, ids: string[]): SeasonInput => ({
  season, leagues: ids.map((id) => {
    const dir = path.join(DATA, 'seasons', season, id);
    const meta: LeagueSeasonFile = JSON.parse(fs.readFileSync(path.join(dir, '_league.json'), 'utf8'));
    return { id, clubs: meta.clubs.map((c) => JSON.parse(fs.readFileSync(path.join(dir, `${c}.json`), 'utf8')) as ClubSeasonFile) };
  }),
});

describe('강제 매각', () => {
  const setup = () => {
    const w = createWorld(load('2025-26', ['eng1']), LIV, 41);
    const poor = Object.values(w.clubs).filter((c) => c.id !== LIV).sort((a, b) => a.reputation - b.reputation)[2];
    for (const id of poor.squad) w.players[id].wage *= 3;   // 주급이 크게 늘어 재정 규정 한도를 넘김
    w.date = '2025-07-01';
    return { w, poor };
  };

  it('재정 규정 한도를 크게 넘은 구단은 이적시장이 열리면 핵심 선수를 시장 가치 70~80%에 내놓는다', () => {
    const { w, poor } = setup();
    expect(overLimit(w, poor.id)).toBeGreaterThan(1.3);
    bargainDay(w, createRng(1));
    const list = (w.bargains ?? []).filter((b) => b.club === poor.id);
    const best = poor.squad.map((id) => w.players[id]).sort((a, b) => overall(b) - overall(a))[0];
    console.log('강제 매각', list.map((b) => [b.player, Math.round(b.price / 1e5) / 10, Math.round((1 - b.price / marketValue(w, w.players[b.player])) * 100) + '%']));
    expect(list.length).toBe(2);
    expect(list.some((b) => b.player === best.id)).toBe(true);
    for (const b of list) {
      const r = b.price / marketValue(w, w.players[b.player]);
      expect(r).toBeGreaterThan(0.65);
      expect(r).toBeLessThan(0.85);
    }
    expect(w.inbox.some((e) => e.type === 'bargain')).toBe(true);
    // 다른 구단은 (한도 안이라) 내놓지 않음
    expect((w.bargains ?? []).every((b) => b.club === poor.id)).toBe(true);
  });

  it('매각가면 핵심 선수라도 판다 · 많이 낮으면 거절 · 이적시장이 끝나면 사라진다', () => {
    const { w, poor } = setup();
    bargainDay(w, createRng(1));
    const b = w.bargains!.find((x) => x.club === poor.id)!;
    const p = w.players[b.player];
    expect(evaluateBid(w, p, LIV, b.price).decision).toBe('accept');
    expect(evaluateBid(w, p, LIV, b.price * 0.6).decision).toBe('reject');
    w.date = '2025-09-02';
    bargainDay(w, createRng(2));
    expect(bargainOf(w, p)).toBeNull();
  });

  it('AI 구단도 급매물을 사 간다', () => {
    const { w, poor } = setup();
    const rng = createRng(3);
    bargainDay(w, rng);
    const ids = w.bargains!.map((b) => b.player);
    for (let d = 2; d <= 60 && ids.some((id) => w.players[id].clubId === poor.id); d++) { w.date = `2025-${d <= 31 ? '07' : '08'}-${String(d <= 31 ? d : d - 31).padStart(2, '0')}`; bargainDay(w, rng); }
    const sold = ids.filter((id) => w.players[id].clubId !== poor.id);
    console.log('AI가 사 감', sold.map((id) => [id, w.players[id].clubId, w.players[id].lastFee]));
    expect(sold.length).toBeGreaterThan(0);
  });
});

describe('강등 조항', () => {
  it('1부 명성 하위 구단의 에이스 일부에게만 · 상위 구단은 없음', () => {
    const w = createWorld(load('2025-26', ['eng1']), LIV, 42);
    const clubs = Object.values(w.clubs).sort((a, b) => a.reputation - b.reputation);
    const low = clubs.slice(0, 8), high = clubs.slice(-6);
    const lowN = low.flatMap((c) => c.squad).filter((id) => relClauseOf(w, w.players[id]) > 0).length;
    const highN = high.flatMap((c) => c.squad).filter((id) => relClauseOf(w, w.players[id]) > 0).length;
    console.log('강등 조항 · 하위 8팀', lowN, '명 · 상위 6팀', highN, '명');
    expect(lowN).toBeGreaterThan(5);
    expect(lowN).toBeLessThanOrEqual(24);
    expect(highN).toBe(0);
  });

  it('강등되면 발동 → 여름 이적시장 동안 그 금액이면 구단은 거절할 수 없다', () => {
    const input = load('2024-25', ['ger1', 'ger2']);
    const w = createWorld(input, input.leagues[1].clubs[0].club, 43);   // 내 구단: 독일 2부
    // 모든 1부 구단 에이스에게 조항을 걸어 둔다 (누가 강등되든 확인)
    for (const c of Object.values(w.clubs).filter((x) => x.league === 'ger1')) {
      const ace = c.squad.map((id) => w.players[id]).sort((a, b) => overall(b) - overall(a))[0];
      ace.relClause = 5e6; ace.relClub = c.id;
    }
    closeSeason(w);
    startNextSeason(w, load('2025-26', ['ger1', 'ger2']));
    const rel = (w.bargains ?? []).filter((b) => b.kind === 'releg');
    console.log('강등 조항 발동', rel.map((b) => [b.club, w.clubs[b.club].league, b.price]));
    expect(rel.length).toBeGreaterThanOrEqual(2);
    for (const b of rel) expect(w.clubs[b.club].league).toBe('ger2');
    const p = w.players[rel[0].player];
    w.date = '2025-07-10';
    const buyer = Object.values(w.clubs).find((c) => c.league === 'ger1')!.id;
    expect(evaluateBid(w, p, buyer, 5e6).decision).toBe('accept');
    expect(p.relClause).toBe(0);   // 한 번 발동하면 끝
  });
});
