// AI 구단 감독: 신뢰도 (내 감독과 같은 규칙: 매달 순위를 이사회 목표와 비교) · 경질 · 새 감독 (전술 성향이 바뀜)
//  - 시즌 중 (10~4월) 신뢰도가 바닥 (12 미만) 이면 경질. 부임 4개월 안 · 한 리그에서 한 달에 한 구단까지
//  - 시즌 끝: 목표보다 크게 못했거나 (6계단 아래) 강등이면 절반 확률로 교체
//  - 공석이 생기면 내 감독 명성과 맞을 때 절반 확률로 나에게 제안 (2주)
//  - 감독 이름은 쓰지 않는다 (실존 인물처럼 보이지 않게)
import type { GameEvent, Mentality, Pressing, SeasonRecord, World } from './types';
import type { Rng } from './rng';
import { sortTable } from './standings';
import { levelOf } from './pyramid';
import { boardTarget, ensureManager } from './manager';

export interface Coach { confidence: number; since: string }

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 864e5;
const addDays = (d: string, n: number) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

export function coachOf(w: World, clubId: string): Coach {
  const c = w.clubs[clubId];
  return (c.coach ??= { confidence: 60, since: w.date });
}

/** 새 감독: 신뢰도 60 · 전술 성향이 새로 (공격성 · 압박) */
function newCoach(w: World, clubId: string, rng: Rng) {
  const c = w.clubs[clubId];
  c.coach = { confidence: 60, since: w.date };
  c.tactics = { ...c.tactics, mentality: rng.pick([-1, 0, 0, 1, 1, 2] as Mentality[]), pressing: rng.pick([0, 1, 1, 2] as Pressing[]) };
  c.lineup = null;
}

/** 큰 소식인지 (같은 리그 · 빅클럽) */
const newsworthy = (w: World, clubId: string) => w.clubs[clubId].league === w.clubs[w.userClubId].league || w.clubs[clubId].reputation >= 85;

/** 공석 → 나에게 제안 (명성이 맞으면 절반 확률) */
function vacancyOffer(w: World, clubId: string, rng: Rng): GameEvent[] {
  const m = ensureManager(w);
  const rep = w.clubs[clubId].reputation;
  if (m.pendingJob || m.offers.some((o) => o.club === clubId) || m.offers.filter((o) => o.kind === 'offer').length >= 2) return [];
  if (rep < m.reputation - 12 || rep > m.reputation + 8 || !rng.chance(0.5)) return [];
  m.offers.push({ club: clubId, date: w.date, until: addDays(w.date, 14), kind: 'offer', years: 3 });
  return [{ type: 'manager', date: w.date, kind: 'offer', club: clubId }];
}

/** 매달 1일 (시즌 중): AI 구단 감독 신뢰도 · 경질 */
export function coachDay(w: World, rng: Rng): GameEvent[] {
  if (w.date.slice(8) !== '01') return [];
  const mon = +w.date.slice(5, 7);
  if (mon > 5 && mon < 9) return [];
  const out: GameEvent[] = [];
  for (const comp of Object.values(w.competitions)) {
    const table = sortTable(comp.table);
    if (!table.some((r) => r.p >= 6)) continue;
    let sacked = false;
    for (let i = 0; i < table.length; i++) {
      const id = table[i].club;
      if (id === w.userClubId || !w.clubs[id]) continue;
      const co = coachOf(w, id);
      const target = boardTarget(w, id);
      co.confidence = clamp(co.confidence + clamp((target - (i + 1)) * 1.5, -8, 6), 0, 100);
      if (!sacked && co.confidence < 12 && (mon >= 10 || mon <= 4) && days(co.since, w.date) >= 120) {
        sacked = true;
        newCoach(w, id, rng);
        out.push({ type: 'coach', date: w.date, club: id, when: 'season', news: newsworthy(w, id) });
        out.push(...vacancyOffer(w, id, rng));
      }
    }
  }
  return out;
}

/** 시즌 끝: 목표보다 크게 못했거나 강등된 AI 구단은 절반 확률로 감독 교체 (나에게 제안은 시즌 전환 뒤) */
export function coachSeasonEnd(w: World, recs: SeasonRecord[], rng: Rng): GameEvent[] {
  const out: GameEvent[] = [];
  for (const r of recs) {
    const n = r.table.length;
    r.table.forEach((row, i) => {
      const id = row.club;
      if (id === w.userClubId || !w.clubs[id]) return;
      const pos = i + 1;
      const relegated = levelOf(r.league) === 1 && pos > n - 3;
      if ((pos > boardTarget(w, id) + 6 || relegated) && rng.chance(0.5)) {
        newCoach(w, id, rng);
        out.push({ type: 'coach', date: w.date, club: id, when: 'end', news: newsworthy(w, id) });
      } else coachOf(w, id).confidence = 60;   // 새 시즌은 다시
    });
  }
  return out;
}
