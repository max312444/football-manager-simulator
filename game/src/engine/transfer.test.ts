import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { advanceDay, createWorld, seasonOver, type SeasonInput } from './world';
import { closeSeason, startNextSeason } from './season';
import { overall } from './ratings';
import { breakTalks, counterOffer, MAX_TRIES, talkBanned, talkOf, windowOpen } from './transfer';
import type { ClubSeasonFile, LeagueSeasonFile } from '../data/types';

const DATA = path.resolve(__dirname, '../../../data-public');
const LIVERPOOL = 'c83d96l';
function loadSeason(season: string): SeasonInput {
  const dir = path.join(DATA, 'seasons', season);
  return {
    season,
    leagues: fs.readdirSync(dir).map((league) => {
      const meta: LeagueSeasonFile = JSON.parse(fs.readFileSync(path.join(dir, league, '_league.json'), 'utf8'));
      return { id: league, clubs: meta.clubs.map((c) => JSON.parse(fs.readFileSync(path.join(dir, league, `${c}.json`), 'utf8')) as ClubSeasonFile) };
    }),
  };
}

describe('이적: 계약 · 이적 명단 판매', () => {
  const w = createWorld(loadSeason('2025-26'), LIVERPOOL, 7);

  it('소속 선수는 모두 계약 기간이 있다 (데이터에 없으면 게임이 정함)', () => {
    const ps = Object.values(w.players).filter((p) => p.clubId);
    expect(ps.every((p) => p.contract)).toBe(true);
    console.log('게임이 정한 계약', ps.filter((p) => p.contractGen).length, '/', ps.length);
  });

  it('이적 명단에 올린 선수에게 이적시장 동안 제안이 들어온다', () => {
    const squad = w.clubs[LIVERPOOL].squad.map((id) => w.players[id]).sort((a, b) => overall(b) - overall(a));
    const listed = [squad[8], squad[14], squad[20]].filter(Boolean);
    w.transferList = listed.map((p) => p.id);
    console.log('시작일', w.date, '이적시장', windowOpen(w.season, w.date));
    const seen = new Map<string, Set<string>>();
    let days = 0;
    while (days++ < 80) {
      for (const o of w.offers ?? []) (seen.get(o.player) ?? seen.set(o.player, new Set()).get(o.player)!).add(o.from);
      w.offers = [];   // 매번 비워서 새 제안이 계속 오는지 확인
      advanceDay(w);
      if (!windowOpen(w.season, w.date) && w.date > '2025-08-15') break;
    }
    for (const p of listed) console.log(p.name, overall(p), '제안 구단 수', seen.get(p.id)?.size ?? 0);
    expect(listed.every((p) => (seen.get(p.id)?.size ?? 0) >= 1)).toBe(true);
  });
});

describe('협상 결렬 · 은퇴 소식', () => {
  it('3번 안에 합의 못 하면 이번 이적시장 끝까지 협상 불가', () => {
    const w = createWorld(loadSeason('2025-26'), LIVERPOOL, 9);
    const id = Object.values(w.players).find((p) => p.clubId && p.clubId !== LIVERPOOL)!.id;
    const t = talkOf(w, id);
    t.fee = MAX_TRIES;
    breakTalks(w, id);
    expect(talkBanned(w, id)).toBe('2025-09-01');
    w.date = '2025-09-02';
    expect(talkBanned(w, id)).toBeNull();
  });

  it('시즌 전환 때 은퇴한 내 선수 · 스타 선수는 소식으로 나온다', () => {
    const w = createWorld(loadSeason('2024-25'), LIVERPOOL, 11);
    while (!seasonOver(w)) advanceDay(w);
    closeSeason(w);
    const r = startNextSeason(w, loadSeason('2025-26'));
    const news = w.pendingNews ?? [];
    console.log('은퇴', r.retired.length, '명 · 소식', news.map((n) => `${n.kind === 'leave' ? '이탈 ' : '은퇴 '}${w.players[n.player].name}(${n.ovr}${n.mine ? ' 리버풀' : ''})`).join(', '));
    expect(news.filter((n) => n.kind !== 'leave').every((n) => w.players[n.player].retired)).toBe(true);
    expect(news.filter((n) => n.kind === 'leave').every((n) => !w.players[n.player].clubId)).toBe(true);
    expect(w.inbox.filter((e) => e.type === 'retire').length).toBeGreaterThanOrEqual(news.filter((n) => n.kind !== 'leave').length);
    // 팀을 떠난 소식이 은퇴 소식보다 먼저
    const r0 = news.findIndex((n) => n.kind !== 'leave');
    expect(r0 === -1 || news.slice(r0).every((n) => n.kind !== 'leave')).toBe(true);
  }, 60000);
});

describe('받은 제안 역제안', () => {
  it('한도 안이면 수락, 조금 넘으면 금액을 올리고, 3번이면 철회', () => {
    const w = createWorld(loadSeason('2025-26'), LIVERPOOL, 5);
    const pid = w.clubs[LIVERPOOL].squad[0], from = Object.keys(w.clubs).find((c) => c !== LIVERPOOL)!;
    const mk = () => ({ id: 'x', player: pid, from, fee: 20e6, max: 30e6, tries: 0, date: w.date, expires: '2025-07-08' });
    let o = mk(); w.offers = [o];
    expect(counterOffer(w, o, 28e6).result).toBe('accept');
    o = mk(); w.offers = [o];
    const r1 = counterOffer(w, o, 35e6);
    expect(r1.result).toBe('raise');
    expect(r1.fee).toBeGreaterThan(20e6);
    expect(counterOffer(w, o, 80e6).result).toBe('reject');
    expect(counterOffer(w, o, 80e6).result).toBe('withdraw');
    expect(w.offers).toHaveLength(0);
    expect(talkBanned(w, `${pid}:${from}`)).toBe('2025-09-01');
  });
});
