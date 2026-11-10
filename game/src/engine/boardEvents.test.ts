// 팬 여론 · 이사회 갈등 이벤트 테스트
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createWorld, type SeasonInput } from './world';
import { boardEventDay, fanMoodOf, resolveBoardEvent } from './boardEvents';
import { ensureManager, managerDay } from './manager';
import { relationOf } from './board';
import { overall } from './ratings';
import { createRng } from './rng';
import type { GameEvent } from './types';
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
const fresh = () => createWorld(load('2025-26', ['eng1']), LIV, 13);
const match = (w: ReturnType<typeof fresh>, g: number, o: number): GameEvent => ({ type: 'match', date: w.date, fixtureId: 'x', league: 'eng1', home: LIV, away: 'y', score: [g, o], user: true });
/** 이벤트가 나올 때까지 10일을 돌린다 */
function until(w: ReturnType<typeof fresh>, kind: string) {
  const m = ensureManager(w);
  for (let s = 1; s < 200; s++) {
    m.boardEvent = undefined; m.lastBoardEvent = undefined;
    w.date = '2025-08-10';   // 여름 이적시장 (판매 요구 · 원하는 선수는 이적시장에만)
    boardEventDay(w, [], createRng(s));
    const ev = ensureManager(w).boardEvent;   // (위에서 undefined 로 둔 값을 타입이 그대로 기억하지 않도록 다시 읽음)
    if (ev?.kind === kind) return ev;
  }
  return null;
}

describe('팬 여론 · 이사회 이벤트', () => {
  it('이적시장이 아닐 때는 판매 요구 · 원하는 선수 이벤트가 나오지 않는다', () => {
    const w = fresh();
    w.clubs[LIV].finance.balance = -200e6;
    const m = ensureManager(w);
    const kinds = new Set<string>();
    for (let s = 1; s < 300; s++) { m.boardEvent = undefined; m.lastBoardEvent = undefined; w.date = '2025-10-10'; boardEventDay(w, [], createRng(s)); const ev = ensureManager(w).boardEvent; if (ev) kinds.add(ev.kind); }
    expect(kinds.has('sellStar')).toBe(false);
    expect(kinds.has('wanted')).toBe(false);
  });

  it('팬 여론은 기대 대비 결과: 이기면 +, 지면 −, 강팀 상대 패배는 덜 · 약팀 상대 패배는 더 깎인다', () => {
    const delta = (g: number, o: number, oppRep: number) => {
      const w = fresh();
      ensureManager(w);
      w.date = '2025-09-02';   // 매달 1일 (여론이 보통으로 돌아오는 조정) 이 아닌 날
      w.clubs.y = { ...w.clubs[LIV], id: 'y', reputation: oppRep };
      const f0 = fanMoodOf(w);
      boardEventDay(w, [match(w, g, o)], createRng(1));
      return fanMoodOf(w) - f0;
    };
    const rep = fresh().clubs[LIV].reputation;
    expect(delta(2, 0, rep)).toBeGreaterThan(0);
    expect(delta(0, 1, rep)).toBeLessThan(0);
    expect(delta(4, 0, rep)).toBeGreaterThan(delta(2, 0, rep));          // 대승은 더
    expect(delta(0, 1, rep + 15)).toBeGreaterThan(delta(0, 1, rep - 15)); // 강팀에 진 건 덜 깎임
    expect(delta(1, 0, rep + 15)).toBeGreaterThan(delta(1, 0, rep - 15)); // 강팀을 이기면 더 오름
  });

  it('판매 요구 (큰 적자 · 이적시장, 핵심 3명은 제외): 수락하면 이적 명단 · 관계 +, 거절하면 관계 − · 다음 시즌 예산 감점', () => {
    const w = fresh();
    w.clubs[LIV].finance.balance = -200e6;   // 매출의 8% 이상 적자
    const ev = until(w, 'sellStar');
    expect(ev?.player).toBeTruthy();
    const top3 = w.clubs[LIV].squad.map((id) => w.players[id]).sort((a, b) => overall(b) - overall(a)).slice(0, 3).map((p) => p.id);
    expect(top3).not.toContain(ev!.player);   // 팀 핵심은 팔라고 하지 않는다
    const r0 = relationOf(w);
    resolveBoardEvent(w, 'accept');
    expect(w.transferList).toContain(ev!.player);
    expect(relationOf(w)).toBe(r0 + 8);
    until(w, 'sellStar');
    resolveBoardEvent(w, 'refuse');
    expect(relationOf(w)).toBe(r0 - 4);
    expect(w.manager!.budgetPenalty).toBe(0.9);
  });

  it('유스 기용 약속: 30일 안에 21세 이하 3경기 이상이면 관계 +, 아니면 −', () => {
    const w = fresh();
    const m = ensureManager(w);
    expect(until(w, 'youth')).toBeTruthy();
    resolveBoardEvent(w, 'accept');
    const r0 = relationOf(w);
    const kid = w.clubs[LIV].squad.map((id) => w.players[id]).sort((a, b) => b.birth.localeCompare(a.birth))[0];
    kid.stats.apps += 3;
    w.date = m.youthPledge!.until;
    boardEventDay(w, [], createRng(1));
    expect(relationOf(w)).toBe(r0 + 6);
  });

  it('이사회가 원하는 선수: 수락하면 이적료 20% 지원 · 관심 목록 추가', () => {
    const w = fresh();
    const ev = until(w, 'wanted');
    expect(ev?.player).toBeTruthy();
    const tb = w.clubs[LIV].finance.transferBudget;
    resolveBoardEvent(w, 'accept');
    expect(w.clubs[LIV].finance.transferBudget).toBeGreaterThan(tb);
    expect(w.shortlist).toContain(ev!.player);
  });

  it('감독 교체 소문 (신뢰도 낮음): 공개 반박 → 팬 여론 + · 관계 −', () => {
    const w = fresh();
    const m = ensureManager(w);
    m.confidence = 20;
    expect(until(w, 'rumour')).toBeTruthy();
    const f0 = fanMoodOf(w), r0 = relationOf(w);
    resolveBoardEvent(w, 'rebut');
    expect(fanMoodOf(w)).toBe(f0 + 5);
    expect(relationOf(w)).toBe(r0 - 6);
  });

  it('팬 여론이 높으면 신뢰도 12.5 에서도 경질되지 않는다 (보통은 경질)', () => {
    const run = (fan: number) => {
      const w = fresh();
      const m = ensureManager(w);
      const t = w.competitions.eng1.table;
      Object.keys(t).forEach((c, i) => Object.assign(t[c], { p: 10, pts: 60 - i }));
      Object.assign(t[LIV], { p: 10, pts: 70 });   // 1위라 신뢰도는 그대로
      m.confidence = 8; m.fanMood = fan;   // 1위라 이번 달 +4.5 → 12.5
      w.date = '2025-11-01';
      managerDay(w, createRng(1));
      return !!m.pendingJob;
    };
    expect(run(50)).toBe(true);
    expect(run(80)).toBe(false);
  });
});
