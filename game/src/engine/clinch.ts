// 리그 우승 확정: 2위 이하 모든 구단이 남은 리그 경기를 다 이겨도 내 승점을 넘을 수 없으면 (같은 승점도 안 되게)
//  - 내 경기 직후 (store.stepMatch) · 매일 (advanceDay, 다른 구단 결과로 확정) 확인. 시즌 · 리그마다 한 번
import type { GameEvent, World } from './types';

export function clinchCheck(w: World): GameEvent | null {
  const club = w.clubs[w.userClubId];
  const comp = club && w.competitions[club.league];
  if (!comp) return null;
  const key = `${w.season}:${club.league}`;
  if (w.clinched === key) return null;
  const me = comp.table[w.userClubId];
  if (!me || me.p < 1) return null;
  const left: Record<string, number> = {};
  for (const f of comp.fixtures) if (!f.stage && !f.result) { left[f.home] = (left[f.home] ?? 0) + 1; left[f.away] = (left[f.away] ?? 0) + 1; }
  for (const [id, row] of Object.entries(comp.table)) {
    if (id === w.userClubId) continue;
    if (row.pts + 3 * (left[id] ?? 0) >= me.pts) return null;
  }
  w.clinched = key;
  w.clinchShow = { league: club.league, club: w.userClubId, left: left[w.userClubId] ?? 0 };
  return { type: 'clinch', date: w.date, league: club.league, club: w.userClubId, left: left[w.userClubId] ?? 0 };
}
