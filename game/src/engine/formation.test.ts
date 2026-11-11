// 사용자 포메이션: 규칙 검사 · 모양 이름 · 등록
import { describe, expect, it } from 'vitest';
import type { Position } from '../data/types';
import { FORMATIONS, formationShape, registerFormations, validateFormation } from './squad';

const F = (s: string) => ['GK', ...s.split(' ')] as Position[];

describe('사용자 포메이션', () => {
  it('기본 포메이션은 모두 규칙 통과', () => {
    for (const [k, v] of Object.entries(FORMATIONS)) expect(validateFormation(v), k).toEqual([]);
  });
  it('적정선 변형은 통과 (비대칭 · 다이아몬드 · 윙어+윙백)', () => {
    expect(validateFormation(F('RB CB CB LB DM CM AM RW ST ST'))).toEqual([]);   // 4-3-1-2 비대칭
    expect(validateFormation(F('RWB CB CB CB LWB DM CM AM ST ST'))).toEqual([]);
    expect(validateFormation(F('RB CB CB CB DM CM LM AM ST ST'))).toEqual([]);  // 오른쪽만 풀백 3백
  });
  it('말이 안 되는 구성은 거절', () => {
    expect(validateFormation(F('ST ST ST ST ST CM CM CB CB RB'))).not.toEqual([]);        // 스트라이커 5
    expect(validateFormation(F('LB LB CB CB RB CM CM RM ST ST'))).not.toEqual([]);        // 왼쪽 풀백 2
    expect(validateFormation(F('CM CM CM CM LM RM AM AM ST ST'))).not.toEqual([]);        // 수비 0
    expect(validateFormation(F('RB CB CB LB AM AM RW LW ST ST'))).not.toEqual([]);        // 중앙 미드 0
    expect(validateFormation(F('RB CB CB CB CB LB CM CM ST ST'))).not.toEqual([]);        // 센터백 4
    expect(validateFormation(F('CB CB DM CM CM RM LM AM ST ST'))).not.toEqual([]);        // 센터백 2 + 풀백 없음
    expect(validateFormation(['CB', ...F('RB CB CB LB CM CM RM LM ST').slice(1), 'ST'] as Position[])).not.toEqual([]); // GK 없음
  });
  it('모양 이름', () => {
    expect(formationShape(FORMATIONS['4-2-3-1'])).toBe('4-2-3-1');
    expect(formationShape(FORMATIONS['4-3-3'])).toBe('4-3-3');
    expect(formationShape(FORMATIONS['3-4-3'])).toBe('3-4-3');
    expect(formationShape(FORMATIONS['5-3-2'])).toBe('5-3-2');
    expect(formationShape(FORMATIONS['3-4-2-1'])).toBe('3-4-2-1');
  });
  it('등록: ★ 이름만, 규칙 어긴 것은 빠짐, 다시 등록하면 이전 것 지움', () => {
    registerFormations({ '★ 내 것': F('RB CB CB LB DM CM AM RW ST ST'), '★ 엉터리': F('ST ST ST ST ST CM CM CB CB RB') });
    expect(FORMATIONS['★ 내 것']).toBeDefined();
    expect(FORMATIONS['★ 엉터리']).toBeUndefined();
    registerFormations({});
    expect(FORMATIONS['★ 내 것']).toBeUndefined();
    expect(FORMATIONS['4-4-2']).toBeDefined();
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { advanceDay, createWorld, type SeasonInput } from './world';
import { recommend } from './ai';
import type { ClubSeasonFile, LeagueSeasonFile } from '../data/types';

const DATA = path.resolve(__dirname, '../../../data-public');
const load = (season: string, ids: string[]): SeasonInput => ({
  season, leagues: ids.map((id) => {
    const dir = path.join(DATA, 'seasons', season, id);
    const meta: LeagueSeasonFile = JSON.parse(fs.readFileSync(path.join(dir, '_league.json'), 'utf8'));
    return { id, clubs: meta.clubs.map((c) => JSON.parse(fs.readFileSync(path.join(dir, `${c}.json`), 'utf8')) as ClubSeasonFile) };
  }),
});

describe('내 포메이션으로 경기', () => {
  it('리버풀이 내 포메이션을 고르면 추천도 그대로 · 경기를 치러도 유지 · AI 는 안 씀', () => {
    const LIV = 'c83d96l';
    const w = createWorld(load('2025-26', ['eng1']), LIV, 5);
    const key = '★ 비대칭';
    w.customFormations = { [key]: F('RB CB CB LB DM CM AM RW ST ST') };
    registerFormations(w.customFormations);
    w.clubs[LIV].tactics.formation = key;
    const opp = Object.keys(w.clubs).find((c) => c !== LIV)!;
    const r = recommend(w, LIV, opp, true);
    expect(r.lineup.formation).toBe(key);
    expect(r.lineup.starters.map((s) => s.slot)).toEqual(w.customFormations[key]);
    let played = 0;
    for (let d = 0; d < 80 && played < 3; d++) {
      advanceDay(w); w.sagaPrompt = undefined; w.scandalPrompt = undefined; if (w.manager) { w.manager.press = undefined; w.manager.boardEvent = undefined; }
      played = w.competitions.eng1.table[LIV].p;
    }
    expect(played).toBeGreaterThanOrEqual(3);
    expect(w.clubs[LIV].tactics.formation).toBe(key);
    expect(Object.values(w.clubs).filter((c) => c.id !== LIV).every((c) => !c.tactics.formation.startsWith('★'))).toBe(true);
    registerFormations({});
  }, 60000);
});
