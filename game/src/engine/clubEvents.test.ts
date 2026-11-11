// 구단 생활 이벤트 (스폰서 · 투어 · 자선 · 선수단 미팅) · 기자회견 반응 문구
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createWorld, type SeasonInput } from './world';
import { resolveBoardEvent, type BoardEventKind } from './boardEvents';
import { ensureManager } from './manager';
import { pressReaction } from './press';
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

describe('구단 생활 이벤트', () => {
  const w = createWorld(load('2025-26', ['eng1']), LIV, 3);
  const m = ensureManager(w);
  const fire = (kind: BoardEventKind, key: string) => { m.boardEvent = { kind, date: w.date, options: [{ key, label: key, hint: '' }] }; return resolveBoardEvent(w, key); };
  const c = w.clubs[LIV];

  it('스폰서: 계약하면 돈이 들어오고 팬 여론 −, 거절하면 팬 +', () => {
    const bal = c.finance.balance, fan = m.fanMood ?? 60;
    const ev = fire('sponsor', 'accept');
    expect(c.finance.balance).toBeGreaterThan(bal);
    expect(m.fanMood!).toBeLessThan(fan);
    expect(ev[0].type === 'info' && ev[0].text).toContain('스폰서');
    const f2 = m.fanMood!;
    fire('sponsor', 'refuse');
    expect(m.fanMood!).toBeGreaterThan(f2);
  });
  it('투어: 수입 + 선수 체력 −', () => {
    const fit = c.squad.reduce((s, id) => s + w.players[id].fitness, 0);
    const bal = c.finance.balance;
    fire('tour', 'accept');
    expect(c.finance.balance).toBeGreaterThan(bal);
    expect(c.squad.reduce((s, id) => s + w.players[id].fitness, 0)).toBeLessThan(fit);
  });
  it('자선 행사 · 선수단 미팅: 사기 변화', () => {
    const mor = () => c.squad.reduce((s, id) => s + w.players[id].morale, 0);
    const a = mor(); fire('charity', 'attend'); expect(mor()).toBeGreaterThan(a);
    const b = mor(); fire('meeting', 'refuse'); expect(mor()).toBeLessThan(b);
    const d = mor(); fire('meeting', 'hold'); expect(mor()).toBeGreaterThan(d);
  });
  it('기자회견 반응은 숫자 없이 문장으로', () => {
    const r = pressReaction({ morale: 3, fan: -2, boast: true }, '살라');
    expect(r.length).toBe(3);
    expect(r.join(' ')).not.toMatch(/[+−]/);
    expect(pressReaction({})).toEqual(['기자들이 다음 질문으로 넘어갑니다']);
  });
});
