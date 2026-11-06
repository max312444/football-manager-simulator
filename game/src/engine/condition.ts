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

/**
 * 하루 경과.
 * @param congested 최근 3일 안에 경기를 뛰었는지 (일정 밀도)
 */
export function dailyUpdate(p: PlayerState, date: string, rng: Rng, congested: boolean) {
  const age = ageOn(p.birth, date);
  const pro = p.hidden.professionalism / 20;

  // 부상 회복
  if (p.injury) {
    p.injury.days--;
    if (p.injury.days <= 0) { p.injury = null; p.sharpness = Math.min(p.sharpness, 45); p.fitness = Math.min(p.fitness, 75); }
  }

  // 체력 회복: 젊고 체력 좋고 프로의식 높을수록 빠름
  const rec = 9 * (0.8 + attr(p, 'sta') / 250) * (age >= 31 ? 0.85 : 1) * (0.9 + 0.2 * pro);
  p.fitness = clamp(p.fitness + (p.injury ? 2 : rec), 0, 100);

  // 몸 상태: 평균으로 돌아가려는 랜덤 워크. 일정이 빡빡하면 떨어지고, 프로의식이 높으면 덜 흔들림
  p.condition = clamp(
    p.condition * 0.88 + rng.normal() * 0.16 * (1.2 - 0.4 * pro) - (congested ? 0.06 : 0) + (p.fitness > 90 ? 0.02 : 0),
    -1, 1,
  );

  // 경기 감각: 안 뛰면 서서히 떨어짐
  p.sharpness = clamp(p.sharpness - 0.7, 20, 100);

  // 사기: 60을 향해 천천히 돌아감
  p.morale = clamp(p.morale + (60 - p.morale) * 0.02, 0, 100);
}

/** 화면 표시용 컨디션 5단계 */
export function conditionLevel(c: number): 2 | 1 | 0 | -1 | -2 {
  return c > 0.5 ? 2 : c > 0.15 ? 1 : c >= -0.15 ? 0 : c >= -0.5 ? -1 : -2;
}
