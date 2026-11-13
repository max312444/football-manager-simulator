// 컨디션: 매일 변화 (체력 회복, 몸 상태, 경기 감각, 사기, 부상 회복)
import type { PlayerState } from './types';
import type { Rng } from './rng';
import { attr } from './ratings';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function ageOn(birth: string, date: string): number {
  const [by, bm, bd] = birth.split('-').map(Number);
  const [y, m, d] = date.split('-').map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/** 나이별 체력 회복 배율: 20세 이하 1.3 → 27세 1.0 → 33세 0.75 → 36세 이상 0.6 */
export function ageRecovery(age: number): number {
  if (age <= 20) return 1.3;
  if (age <= 27) return 1.3 - (0.3 * (age - 20)) / 7;
  if (age <= 33) return 1 - (0.25 * (age - 27)) / 6;
  return Math.max(0.6, 0.75 - 0.05 * (age - 33));
}

/**
 * 하루 경과.
 * @param congested 최근 3일 안에 경기를 뛰었는지 (일정 밀도)
 * @param recovery 체력 회복 배율 (훈련 강도: 낮음 1.08 · 보통 1 · 높음 0.9)
 * @param moraleTo 사기가 돌아가려는 값 (감독 동기부여, managers.ts moraleTarget)
 */
export function dailyUpdate(p: PlayerState, date: string, rng: Rng, congested: boolean, recovery = 1, moraleTo = 60) {
  const age = ageOn(p.birth, date);
  const pro = p.hidden.professionalism / 20;

  // 부상 회복
  if (p.injury) {
    p.injury.days--;
    if (p.injury.days <= 0) { p.injury = null; p.sharpness = Math.min(p.sharpness, 45); p.fitness = Math.min(p.fitness, 75); }
  }

  // 체력 회복: 젊을수록 · 체력 좋을수록 · 프로의식 높을수록 빠름 (ageRecovery)
  // 85 이상은 회복이 절반 (마지막 컨디션은 시간이 걸림)
  // 풀타임(약 -32) 뒤 사흘: 20세 약 90 · 27세 약 87 · 33세 약 80 → 젊은 선수는 주중 · 주말 연전을 여러 번, 베테랑은 로테이션
  const rec = 7.5 * (0.8 + attr(p, 'sta') / 250) * ageRecovery(age) * (0.9 + 0.2 * pro) * recovery * (p.fitness >= 85 ? 0.5 : 1);   // recovery = 훈련 강도 배율
  p.fitness = clamp(p.fitness + (p.injury ? 2 : rec), 0, 100);

  // 몸 상태: 평균으로 돌아가려는 랜덤 워크. 일정이 빡빡하면 떨어지고, 프로의식이 높으면 덜 흔들림
  p.condition = clamp(
    p.condition * 0.88 + rng.normal() * 0.16 * (1.2 - 0.4 * pro) - (congested ? 0.06 : 0) + (p.fitness > 90 ? 0.02 : 0),
    -1, 1,
  );

  // 경기 감각: 안 뛰면 서서히 떨어짐
  p.sharpness = clamp(p.sharpness - 0.7, 20, 100);

  // 사기: 기준값(보통 60, 감독 동기부여 능력에 따라 ±)을 향해 천천히 돌아감
  p.morale = clamp(p.morale + (moraleTo - p.morale) * 0.02, 0, 100);
}

/** 화면 표시용 컨디션 5단계 */
export function conditionLevel(c: number): 2 | 1 | 0 | -1 | -2 {
  return c > 0.5 ? 2 : c > 0.15 ? 1 : c >= -0.15 ? 0 : c >= -0.5 ? -1 : -2;
}
