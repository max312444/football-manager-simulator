// 구단 시설 (훈련장 · 유스 아카데미, 1~5단계)
//  - 훈련 시설: 매달 훈련 성장 폭 (training.ts monthlyDev)
//  - 유스 시설: 유스 선수 잠재력 · 에이스 확률 (youth.ts rollPotential)
//  - 투자: 구단 돈으로 한 단계씩, 공사 기간이 지나면 오른다. 올린 단계는 다음 시즌 데이터보다 낮아지지 않는다
import type { ClubState, GameEvent, World } from './types';
import { book, clubRevenue } from './finance';

export type FacilityKind = 'training' | 'youth';
export const FACILITY_KO: Record<FacilityKind, string> = { training: '훈련 시설', youth: '유스 시설' };

/** 시설 단계 (데이터에 없으면 명성으로: 데이터 만들 때와 같은 규칙) */
export function facilityLevel(c: ClubState, kind: FacilityKind): number {
  const v = c.facilities?.[kind];
  if (v) return v;
  if (kind === 'training') return c.reputation >= 80 ? 5 : c.reputation >= 74 ? 4 : c.reputation >= 68 ? 3 : 2;
  return c.reputation >= 78 ? 4 : 3;
}

/** 다음 단계 비용 (연 매출 기준: 훈련 시설은 단계 × 1.4%, 유스 시설은 단계 × 1% — 매출 €8억 구단의 훈련 시설 5단계 ≈ €56M) · 공사 기간 */
export function upgradeCost(w: World, clubId: string, kind: FacilityKind): { cost: number; days: number; next: number } | null {
  const c = w.clubs[clubId];
  const next = facilityLevel(c, kind) + 1;
  if (next > 5) return null;
  const rev = clubRevenue(w, clubId);
  const cost = Math.round((rev * (kind === 'training' ? 0.014 : 0.01) * next) / 1e5) * 1e5;
  return { cost, days: 90 + 30 * next, next };
}

const addDays = (d: string, n: number) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

/** 공사 시작 (구단 잔고가 비용 이상일 때만) */
export function startUpgrade(w: World, clubId: string, kind: FacilityKind): { ok: boolean; reason?: string } {
  const c = w.clubs[clubId];
  if (c.building?.some((b) => b.kind === kind)) return { ok: false, reason: '이미 공사 중입니다' };
  const u = upgradeCost(w, clubId, kind);
  if (!u) return { ok: false, reason: '이미 최고 단계입니다' };
  if (c.finance.balance < u.cost) return { ok: false, reason: '구단 잔고가 모자랍니다' };
  book(w, clubId, 'facility', u.cost);
  c.building = [...(c.building ?? []), { kind, level: u.next, done: addDays(w.date, u.days), cost: u.cost }];
  return { ok: true };
}

/** 하루: 끝난 공사 반영 */
export function facilityDay(w: World): GameEvent[] {
  const events: GameEvent[] = [];
  for (const c of Object.values(w.clubs)) {
    if (!c.building?.length) continue;
    for (const b of c.building.filter((b) => b.done <= w.date)) {
      c.facilities = { training: facilityLevel(c, 'training'), youth: facilityLevel(c, 'youth'), [b.kind]: b.level };
      c.built = { ...(c.built ?? {}), [b.kind]: b.level };
      if (c.id === w.userClubId) events.push({ type: 'info', date: w.date, text: `${FACILITY_KO[b.kind]} 공사 완료 · ${b.level}단계` });
    }
    c.building = c.building.filter((b) => b.done > w.date);
  }
  return events;
}
