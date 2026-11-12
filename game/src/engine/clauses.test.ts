// 계약 조항 (바이아웃) 테스트
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createWorld, type SeasonInput } from './world';
import { overall } from './ratings';
import { evaluateBid, marketValue, playerWillJoin, wageDemand } from './transfer';
import { aiBuyoutRaids, buyoutOf, buyoutOptions, buyoutWageFactor, setBuyout } from './clauses';
import { applyRenewal, evaluateRenewal } from './contract';
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

describe('바이아웃', () => {
  const w = createWorld(load('2025-26', ['eng1', 'esp1']), LIV, 11);
  const inLeague = (lg: string) => Object.values(w.players).filter((p) => p.clubId && w.clubs[p.clubId]?.league === lg);

  it('스페인 리그는 모든 선수에게 바이아웃 · 다른 리그는 약 20%', () => {
    const esp = inLeague('esp1'), eng = inLeague('eng1').filter((p) => p.clubId !== LIV);
    const espShare = esp.filter((p) => buyoutOf(w, p) > 0).length / esp.length;
    const engShare = eng.filter((p) => buyoutOf(w, p) > 0).length / eng.length;
    console.log('바이아웃 있는 선수 비율 · 스페인', espShare.toFixed(2), '잉글랜드', engShare.toFixed(2));
    expect(espShare).toBe(1);
    expect(engShare).toBeGreaterThan(0.12);
    expect(engShare).toBeLessThan(0.3);
    // 가치보다 높게 (스페인 스타는 ×4 이상)
    for (const p of esp.slice(0, 50)) expect(buyoutOf(w, p)).toBeGreaterThanOrEqual(marketValue(w, p) * 1.9);
    // 다시 물어도 같은 값
    expect(esp.slice(0, 20).map((p) => buyoutOf(w, p))).toEqual(esp.slice(0, 20).map((p) => buyoutOf(w, p)));
  });

  it('바이아웃 이상을 내면 핵심 선수라도 구단이 거절할 수 없다', () => {
    const star = inLeague('esp1').sort((a, b) => overall(b) - overall(a))[0];
    const small = Object.values(w.clubs).filter((c) => c.league === 'eng1').sort((a, b) => a.reputation - b.reputation)[0].id;   // 명성 낮은 구단
    setBuyout(star, marketValue(w, star) * 1.2);   // 구단이 부르는 값(가치 ×1.6)보다 낮은 바이아웃
    const clause = buyoutOf(w, star);
    expect(evaluateBid(w, star, small, clause - 1e6).decision).not.toBe('accept');
    const r = evaluateBid(w, star, small, clause);
    expect(r.decision).toBe('accept');
    expect(r.reason).toContain('바이아웃');
  });

  it('바이아웃을 낮게 걸어 줄수록 선수가 주급을 덜 요구한다', () => {
    const p = inLeague('eng1').find((x) => x.clubId !== LIV && overall(x) >= 75)!;
    const opts = buyoutOptions(w, p, LIV);
    expect(opts[0].fee).toBe(0);   // 잉글랜드 구단은 '없음' 가능
    const f = opts.map((o) => buyoutWageFactor(w, p, o.fee));
    console.log('주급 요구 배율 (없음 · ×1.5 · ×2.5 · ×4)', f);
    expect(f[0]).toBe(1);   // 안 넣으면 일반 계약
    expect(f[1]).toBeLessThan(f[2]);
    expect(f[2]).toBeLessThan(f[3]);
    expect(f[3]).toBeLessThan(1);
    // 스페인 구단은 '없음' 불가
    const espClub = Object.values(w.clubs).find((c) => c.league === 'esp1')!;
    expect(buyoutOptions(w, p, espClub.id).every((o) => o.fee > 0)).toBe(true);
    // 같은 주급이 낮은 바이아웃이면 통과, 바이아웃 없으면 거절될 수 있다
    const wage = Math.round(wageDemand(w, p) * 0.88);
    expect(playerWillJoin(w, p, LIV, wage, undefined, opts[1].fee).low).toBeFalsy();
    expect(playerWillJoin(w, p, LIV, wage, undefined, 0).low).toBe(true);
  });

  it('재계약: 바이아웃을 정하면 그 값, 정하지 않으면 지금 조건 그대로', () => {
    const p = w.clubs[LIV].squad.map((id) => w.players[id]).find((x) => evaluateRenewal(w, x, x.wage * 3, 3).ok)!;
    const before = buyoutOf(w, p);
    applyRenewal(w, p, p.wage, 3);
    expect(buyoutOf(w, p)).toBe(before);
    const low = buyoutOptions(w, p, LIV)[1].fee;
    expect(evaluateRenewal(w, p, Math.round(wageDemand(w, p) * 2), 3, low).ok).toBe(true);
    applyRenewal(w, p, p.wage, 3, low);
    expect(buyoutOf(w, p)).toBe(low);
  });

  it('내 선수 바이아웃이 시장 가치에 가까우면 다른 구단이 내고 데려간다 · 없으면 안 데려간다', () => {
    const ww = createWorld(load('2025-26', ['eng1', 'esp1']), LIV, 12);
    const squad = ww.clubs[LIV].squad.map((id) => ww.players[id]).sort((a, b) => overall(b) - overall(a));
    for (const p of squad) setBuyout(p, 0);
    const rng = createRng(3);
    for (let d = 0; d < 300; d++) expect(aiBuyoutRaids(ww, rng)).toEqual([]);
    const target = squad[5];
    setBuyout(target, marketValue(ww, target));
    let gone = 0;
    for (let d = 0; d < 400 && !gone; d++) gone = aiBuyoutRaids(ww, rng).length;
    console.log('바이아웃 = 시장 가치 · 데려간 구단', target.clubId, '· 이적료', ww.inbox.at(-1));
    expect(gone).toBe(1);
    expect(target.clubId).not.toBe(LIV);
    expect(ww.inbox.at(-1)?.type).toBe('buyout');
  });
});
