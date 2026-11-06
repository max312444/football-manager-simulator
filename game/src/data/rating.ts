// 종합 능력치(OVR) 미리보기 계산.
// 데이터 파이프라인 모델(tools/data_pipeline/steps/model.js)의 포지션별 편차를 거꾸로 적용해 근사한다.
// M1(데이터 빌드)에서 정식 계산으로 교체 예정.
import type { AttrKey, Position, SquadPlayer } from './types';

type Weights = Partial<Record<AttrKey, number>>;
const WB: Weights = { sho: -18, pas: -2, dri: -2, tac: 2, pos: 0, aer: -8, pac: 4, sta: 4, str: -4, vis: -6, com: -2, ldr: -4 };
const WM: Weights = { sho: -6, pas: 2, dri: 2, tac: -10, pos: -8, aer: -12, pac: 4, sta: 4, str: -6, vis: 0, com: 0, ldr: -4 };
const WING: Weights = { sho: 0, pas: 0, dri: 5, tac: -22, pos: -18, aer: -14, pac: 6, sta: 0, str: -8, vis: 0, com: 0, ldr: -6 };

const W: Record<Position, Weights> = {
  GK: { ref: 4, han: 3, one: 2, pas: -8, pos: 3, aer: 0, pac: -15, sta: -10, str: -2, vis: -10, com: 2, ldr: -2 },
  CB: { sho: -25, pas: -6, dri: -12, tac: 5, pos: 5, aer: 5, pac: -4, sta: -2, str: 4, vis: -12, com: 0, ldr: 0 },
  LB: WB, RB: WB, LWB: WB, RWB: WB,
  DM: { sho: -10, pas: 3, dri: -4, tac: 4, pos: 4, aer: -2, pac: -6, sta: 4, str: 2, vis: 0, com: 2, ldr: 0 },
  CM: { sho: -4, pas: 4, dri: 0, tac: -2, pos: 0, aer: -8, pac: -3, sta: 4, str: -3, vis: 3, com: 2, ldr: -2 },
  AM: { sho: 2, pas: 4, dri: 4, tac: -20, pos: -15, aer: -14, pac: 0, sta: -2, str: -8, vis: 5, com: 3, ldr: -4 },
  LW: WING, RW: WING, LM: WM, RM: WM,
  ST: { sho: 5, pas: -6, dri: 0, tac: -28, pos: -20, aer: 0, pac: 2, sta: -2, str: 2, vis: -6, com: 3, ldr: -4 },
};

export function overall(p: SquadPlayer): number {
  const w = W[p.pos] ?? W.CM;
  const vals = Object.entries(p.attrs).map(([k, v]) => (v ?? 0) - (w[k as AttrKey] ?? 0));
  if (!vals.length) return 0;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

export function ageAt(birth: string, date: string): number {
  const b = new Date(birth), d = new Date(date);
  let a = d.getFullYear() - b.getFullYear();
  if (d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())) a--;
  return a;
}

export const POS_ORDER: Position[] = ['GK', 'RB', 'RWB', 'CB', 'LB', 'LWB', 'DM', 'CM', 'RM', 'LM', 'AM', 'RW', 'LW', 'ST'];
export const POS_KO: Record<Position, string> = {
  GK: '골키퍼', CB: '센터백', LB: '레프트백', RB: '라이트백', LWB: '레프트 윙백', RWB: '라이트 윙백',
  DM: '수비형 미드필더', CM: '중앙 미드필더', AM: '공격형 미드필더', LM: '레프트 미드필더', RM: '라이트 미드필더', LW: '레프트 윙', RW: '라이트 윙', ST: '스트라이커',
};
export const posGroup = (p: Position) =>
  p === 'GK' ? 'GK' : ['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(p) ? 'DF' : ['DM', 'CM', 'AM', 'LM', 'RM'].includes(p) ? 'MF' : 'FW';
