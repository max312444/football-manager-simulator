// 출전 시간과 충성도
//  - 출전하면 충성도 ↑ (선발 > 교체 출전). 대신 체력은 떨어진다 (match.ts)
//  - 뛸 수 있는데 못 나가면: 1~2경기는 유지, 연속 벤치가 길어질수록 점점 크게 ↓
//  - 부상 · 징계(· 나중에 국가대표 차출)로 빠진 경기는 계산하지 않는다
//  - 야망이 큰 선수일수록 벤치에 더 민감, 충성도가 낮아지면 사기도 떨어진다
import type { PlayerState, World } from './types';
import { traitMul } from './traits';

export const UNHAPPY = 30;   // 이 아래로 떨어지면 불만 (받은편지함 알림)
const clamp = (v: number) => Math.max(0, Math.min(100, v));

/** 새 선수의 처음 충성도: 숨은 속성(충성도 1~20) 기준 42~80 */
export const initialLoyalty = (p: Pick<PlayerState, 'hidden'>) => 40 + p.hidden.loyalty * 2;

/** 벤치 연속 경기 수에 따른 감소량 */
export function benchPenalty(streak: number): number {
  if (streak <= 2) return 0;
  if (streak <= 5) return 0.4;
  if (streak <= 9) return 0.7;
  return 1;
}

/**
 * 선수단 안 위치에 따른 출전 기대치 (0~1). 주전급일수록 벤치에 민감하다.
 * 능력 순위 1~11위 1.0 · 12~16위 0.7 · 17~22위 0.35 · 그 밖 0.1, 주전이 아닌 골키퍼 0.15
 */
export function expectations(w: World, clubId: string): Map<string, number> {
  const ps = w.clubs[clubId].squad.map((id) => w.players[id]);
  const ovr = (p: PlayerState) => { const v = Object.values(p.base); return v.reduce((a, b) => a + (b ?? 0), 0) / Math.max(1, v.length); };
  const out = new Map<string, number>();
  const gks = ps.filter((p) => p.pos === 'GK').sort((a, b) => ovr(b) - ovr(a));
  gks.forEach((p, i) => out.set(p.id, i === 0 ? 1 : 0.15));
  ps.filter((p) => p.pos !== 'GK').sort((a, b) => ovr(b) - ovr(a)).forEach((p, i) => out.set(p.id, i < 10 ? 1 : i < 15 ? 0.7 : i < 21 ? 0.35 : 0.1));
  return out;
}

/**
 * 경기 하나가 끝난 뒤 두 구단 선수단의 출전 기록을 반영한다.
 * minutes: 이번 경기 출전 시간 (뛴 선수만), startedIds: 선발 출전
 * 반드시 징계 소진 전에 호출 (경기 시작 때 징계 중이던 선수를 구분하기 위해)
 */
export function updatePlaytime(w: World, clubs: string[], minutes: Record<string, number>, startedIds: Set<string>) {
  for (const clubId of clubs) {
    const expect = expectations(w, clubId);
    for (const id of w.clubs[clubId].squad) {
      const p = w.players[id];
      const played = (minutes[id] ?? 0) > 0;
      if (played) {
        // 높은 충성도에선 더 천천히 오른다
        const gain = (startedIds.has(id) ? 0.6 : 0.4) * (p.loyalty >= 70 ? 0.5 : 1);
        p.loyalty = clamp(p.loyalty + gain);
        p.benchStreak = 0;
      } else {
        // 부상 · 징계로 못 뛴 경기는 제외
        if (p.injury || p.suspension > 0) continue;
        p.benchStreak += 1;
        const ambition = 0.6 + p.hidden.ambition / 25;           // 0.64 ~ 1.4
        p.loyalty = clamp(p.loyalty - benchPenalty(p.benchStreak) * ambition * (expect.get(id) ?? 0.5) * traitMul(p, 'bench'));
        if (p.benchStreak >= 4 && (expect.get(id) ?? 0) >= 0.7) p.morale = Math.max(0, p.morale - 1);
      }
      // 불만 알림 (사용자 구단, 한 번만) · 회복되면 다시 알릴 수 있게 해제
      if (clubId === w.userClubId) {
        if (p.loyalty < UNHAPPY && !p.unhappy) {
          p.unhappy = true;
          w.inbox.push({ type: 'info', date: w.date, text: `${p.name} — 출전 시간이 부족하다며 불만을 드러냈습니다 (연속 ${p.benchStreak}경기 결장)` });
        } else if (p.loyalty >= UNHAPPY + 10 && p.unhappy) {
          p.unhappy = false;
        }
      }
    }
  }
}

/** 화면 표시용 단계 */
export function loyaltyLabel(v: number): string {
  if (v >= 80) return '매우 높음';
  if (v >= 60) return '높음';
  if (v >= 40) return '보통';
  if (v >= UNHAPPY) return '낮음';
  return '불만';
}
