// 이적 어필: 우리 구단에 오고 싶은 선수가 먼저 연락 (에이전트를 통해)
//  - 이적시장 기간과 그 직전 한 달 (6월 · 12월), 평균 10일에 한 번 정도, 동시에 2명까지
//  - 후보: 다른 구단 선수 (임대 · 사전 계약 · 급매물 아님), 33세 이하, 우리 팀 주전 전력 −8 ~ +4 (쓸 만하지만 현실적인 급)
//          우리 구단 명성이 지금 구단보다 높거나, 출전 시간 · 불만 때문에 떠나고 싶은 선수 (야망 높을수록)
//  - 효과: 우리 구단과 계약할 때 원하는 주급 15% 덜 (APPEAL_WAGE), 오려는 마음 ↑. 이적료는 파는 구단 몫이라 그대로
//  - 기한: 그 이적시장 끝 (직전 달이면 시장이 열린 뒤 끝까지). 우리 구단으로 오면 사라짐. 선수마다 시즌에 한 번
import type { GameEvent, PlayerState, World } from './types';
import type { Rng } from './rng';
import { overall } from './ratings';
import { ageOn } from './condition';
import { teamStrength } from './ai';
import { windowEnd, windowOpen } from './transfer';
import { bargainOf } from './firesale';

export interface Appeal { player: string; club: string; date: string; until: string }
/** 어필한 선수가 우리 구단에 바라는 주급 배율 */
export const APPEAL_WAGE = 0.85;

/** 지금 유효한 어필 (우리 구단 대상) */
export function appealOf(w: World, p: PlayerState): Appeal | null {
  const a = w.appeals?.find((x) => x.player === p.id);
  return a && a.until >= w.date && p.clubId === a.club ? a : null;
}

const addDays = (d: string, n: number) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

/** 이적시장이 열렸거나 한 달 안에 열림 → 어필 기한 (그 시장 끝), 아니면 null */
function appealUntil(w: World): string | null {
  if (windowOpen(w.season, w.date)) return windowEnd(w.season, w.date);
  const soon = addDays(w.date, 30);
  return windowOpen(w.season, soon) ? windowEnd(w.season, soon) : null;
}

export function appealDay(w: World, rng: Rng): GameEvent[] {
  // 지난 어필 정리: 기한 지남 · 우리 구단으로 옴 · 다른 구단으로 감
  w.appeals = (w.appeals ?? []).filter((a) => a.until >= w.date && w.players[a.player]?.clubId === a.club);
  const until = appealUntil(w);
  if (!until || w.appeals.length >= 2 || !rng.chance(0.1)) return [];
  const me = w.clubs[w.userClubId];
  const str = teamStrength(w, w.userClubId);
  const seen = (w.appealSeen ??= {});
  const cands: { p: PlayerState; wt: number }[] = [];
  for (const club of Object.values(w.clubs)) {
    if (club.id === w.userClubId || !w.competitions[club.league]) continue;
    for (const id of club.squad) {
      const p = w.players[id];
      if (p.loan || p.precontract || p.injury || seen[id] === w.season || bargainOf(w, p)) continue;
      const ovr = overall(p);
      if (ovr < str - 8 || ovr > str + 4 || ageOn(p.birth, w.date) > 33) continue;
      const repGap = me.reputation - club.reputation;
      const restless = (p.unhappy ? 1 : 0) + (p.benchStreak >= 4 ? 1 : 0) + (p.saga?.kind === 'move' ? 1 : 0);
      if (repGap < 3 && !(restless && repGap >= -5)) continue;
      const ambition = (p.hidden.ambition - 10) / 10;
      const wt = Math.max(0.1, repGap / 10 + restless * 1.5 + ambition - (p.loyalty - 50) / 30);
      cands.push({ p, wt });
    }
  }
  if (!cands.length) return [];
  const { p } = rng.weighted(cands, (c) => c.wt);
  seen[p.id] = w.season;
  w.appeals.push({ player: p.id, club: p.clubId!, date: w.date, until });
  if (!(w.shortlist ?? []).includes(p.id)) w.shortlist = [...(w.shortlist ?? []), p.id];   // 찾기 쉽게 관심 목록에
  return [{ type: 'appeal', date: w.date, player: p.id, club: p.clubId!, until }];
}
