// 선수 언론 플레이 (연봉 요구 · 이적 요청 · 태업) 테스트
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createWorld, type SeasonInput } from './world';
import { aiSagaDay, sagaDay, sagaRespond } from './saga';
import { available } from './squad';
import { monthlyDev } from './training';
import { overall } from './ratings';
import { evaluateBid, marketValue, wageForAbility } from './transfer';
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
// 중위권 구단 (빅클럽이 위에 있어야 이적 요청 대상이 생긴다)
const fresh = () => {
  const input = load('2025-26', ['eng1']);
  const mid = [...input.leagues[0].clubs].sort((a, b) => b.reputation - a.reputation)[9].club;
  const w = createWorld(input, mid, 31);
  return { w, me: mid };
};
/** 다른 선수 사가 지우기 (한 선수만 보려고) */
const only = (w: ReturnType<typeof fresh>['w'], me: string, id: string) => { for (const q of w.clubs[me].squad) if (q !== id) w.players[q].saga = undefined; };
/** 핵심 선수 하나를 성격 나쁘게 (야망 높음 · 프로의식 · 충성도 낮음) */
const brat = (w: ReturnType<typeof fresh>['w'], me: string) => {
  const p = w.clubs[me].squad.map((id) => w.players[id]).filter((x) => +x.birth.slice(0, 4) >= 1997).sort((a, b) => overall(b) - overall(a))[0];   // 30세 미만 핵심
  p.hidden = { ...p.hidden, ambition: 20, professionalism: 1, loyalty: 1 };
  p.injury = null;
  return p;
};

describe('선수 언론 플레이', () => {
  it('연봉 인상 요구: 시세보다 많이 낮으면 시작 → 요구 주급 이상이 되면 해결', () => {
    const { w, me } = fresh();
    const p = brat(w, me);
    p.wage = Math.round(wageForAbility(w, overall(p)) * 0.3);
    for (let s = 1; s < 300 && p.saga?.kind !== 'wage'; s++) { p.saga = undefined; only(w, me, p.id); w.date = '2025-10-05'; sagaDay(w, createRng(s)); }
    expect(p.saga?.kind).toBe('wage');
    p.wage = p.saga!.wantWage!;
    const ev = sagaDay(w, createRng(1));
    expect(ev.some((e) => e.type === 'saga' && e.step === 'resolved')).toBe(true);
    expect(p.saga).toBeUndefined();
  });

  it('이적 요청: 이적시장에서 단계가 오르면 지목한 구단이 (깎은) 제안 · 3단계면 출전 거부', () => {
    const { w, me } = fresh();
    const p = brat(w, me);
    p.unhappy = true; p.morale = 20;
    for (let s = 1; s < 400 && p.saga?.kind !== 'move'; s++) { p.saga = undefined; only(w, me, p.id); w.date = '2025-08-05'; sagaDay(w, createRng(s)); }
    expect(p.saga?.kind).toBe('move');
    const target = p.saga!.target!;
    expect(w.clubs[target].reputation).toBeGreaterThanOrEqual(w.clubs[me].reputation + 6);
    // 이적시장 (8월) 동안 2주씩: 3단계까지
    let d = 0;
    for (let k = 0; k < 30 && p.saga!.stage < 3; k++) { w.date = `2025-08-${String(6 + (d % 20)).padStart(2, '0')}`; p.saga!.next = w.date; sagaDay(w, createRng(100 + k)); d++; }
    expect(p.saga!.stage).toBe(3);
    expect(available(p)).toBe(false);
    expect((w.offers ?? []).some((o) => o.player === p.id && o.from === target)).toBe(true);
    // 훈련 불참: 성장 대신 하락
    expect(monthlyDev(w, p)).toBeLessThan(0);
  });

  it('이적시장 밖에서는 1단계 (공개 인터뷰) 에서 멈춘다', () => {
    const { w, me } = fresh();
    const p = brat(w, me);
    p.saga = { kind: 'move', stage: 0, since: '2025-10-01', next: '2025-10-01', target: Object.keys(w.clubs).find((c) => c !== me)! };
    for (let k = 0; k < 40; k++) { w.date = '2025-10-20'; p.saga!.next = w.date; sagaDay(w, createRng(k)); }
    expect(p.saga!.stage).toBe(1);
  });

  it('대응: 판매 허락 → 이적 명단 · 태업 멈춤 / 약속 → 1단계 이하로', () => {
    const { w, me } = fresh();
    const p = brat(w, me);
    p.saga = { kind: 'move', stage: 3, since: w.date, next: '2099-01-01', target: Object.keys(w.clubs).find((c) => c !== me)! };
    sagaRespond(w, p.id, 'list', createRng(1));
    expect(w.transferList).toContain(p.id);
    expect(p.saga!.stage).toBe(0);
    expect(available(p)).toBe(true);
    p.saga!.stage = 3;
    sagaRespond(w, p.id, 'promise', createRng(1));
    expect(p.saga!.stage).toBeLessThanOrEqual(1);
    expect(p.saga!.promise).toBeTruthy();
  });

  it('성격 좋은 선수 (프로의식 · 충성도 높음) 는 거의 사가를 일으키지 않는다', () => {
    const { w, me } = fresh();
    const p = brat(w, me);
    p.hidden = { ...p.hidden, ambition: 8, professionalism: 20, loyalty: 20 };
    p.wage = 1000; p.unhappy = true;
    for (let s = 1; s < 200; s++) { w.date = '2025-10-05'; sagaDay(w, createRng(s)); if (p.saga) break; }
    expect(p.saga).toBeUndefined();
  });
});

describe('AI 구단 선수 언론 플레이', () => {
  it('이적시장 동안 다른 구단 스타가 태업 끝에 지목한 구단으로 깎인 값에 이적', () => {
    const { w, me } = fresh();
    const other = Object.values(w.clubs).filter((c) => c.id !== me).sort((a, b) => a.reputation - b.reputation)[5];
    const p = other.squad.map((id) => w.players[id]).filter((x) => +x.birth.slice(0, 4) >= 1996).sort((a, b) => overall(b) - overall(a))[0];
    const target = Object.values(w.clubs).filter((c) => c.id !== me && c.id !== other.id).sort((a, b) => b.reputation - a.reputation)[0].id;
    p.saga = { kind: 'move', stage: 2, since: '2025-08-01', next: '2099-01-01', target, club: other.id };
    w.date = '2025-08-10';
    let paid = 0;
    aiSagaDay(w, createRng(1), (q, to, fee) => { if (q.id === p.id && to === target) { paid = fee; return true; } return false; });
    expect(paid).toBeGreaterThan(0);
    expect(paid).toBeLessThan(marketValue(w, p));
  });

  it('우리 구단을 지목한 선수: 원래 구단이 단계만큼 싸게 판다 · 핵심 선수 규칙도 없음', () => {
    const { w, me } = fresh();
    const other = Object.values(w.clubs).filter((c) => c.id !== me).sort((a, b) => a.reputation - b.reputation)[3];
    const p = other.squad.map((id) => w.players[id]).sort((a, b) => overall(b) - overall(a))[0];
    const normal = evaluateBid(w, p, me, 1).ask;
    p.saga = { kind: 'move', stage: 3, since: w.date, next: '2099-01-01', target: me, club: other.id };
    expect(evaluateBid(w, p, me, 1).ask).toBeCloseTo(normal * 0.7);
  });

  it('이적시장이 닫히면 AI 선수 사가는 잠잠해진다', () => {
    const { w, me } = fresh();
    const other = Object.values(w.clubs).find((c) => c.id !== me)!;
    const p = other.squad.map((id) => w.players[id]).sort((a, b) => overall(b) - overall(a))[0];
    p.saga = { kind: 'move', stage: 2, since: '2025-08-01', next: '2099-01-01', target: me, club: other.id };
    w.date = '2025-10-10';
    aiSagaDay(w, createRng(1), () => false);
    expect(p.saga).toBeUndefined();
  });
});
