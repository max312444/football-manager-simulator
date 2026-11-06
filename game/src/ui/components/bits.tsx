// 작은 공용 표시 요소
import { conditionLevel } from '../../engine/condition';
import { posGroup } from '../../data/rating';
import type { Position } from '../../data/types';

const GROUP_TONE: Record<string, string> = {
  GK: 'text-[#f2c14e] bg-[#f2c14e]/10', DF: 'text-sky bg-sky/10', MF: 'text-neon bg-neon/10', FW: 'text-red bg-red/10',
};
export function PosTag({ pos, className = '' }: { pos: Position; className?: string }) {
  return <span className={`inline-block w-11 rounded py-0.5 text-center text-[11px] font-semibold ${GROUP_TONE[posGroup(pos)]} ${className}`}>{pos}</span>;
}

/** 컨디션 5단계 화살표 */
export function ConditionIcon({ value }: { value: number }) {
  const lv = conditionLevel(value);
  const map = {
    2: { rot: -90, c: 'text-neon', t: '최상' }, 1: { rot: -45, c: 'text-[#a6f08a]', t: '좋음' }, 0: { rot: 0, c: 'text-mid', t: '보통' },
    [-1]: { rot: 45, c: 'text-amber', t: '나쁨' }, [-2]: { rot: 90, c: 'text-red', t: '최악' },
  } as const;
  const m = map[lv];
  return (
    <span title={`컨디션 ${m.t}`} className={`inline-grid h-5 w-5 place-items-center ${m.c}`}>
      <svg width="14" height="14" viewBox="0 0 24 24" style={{ transform: `rotate(${m.rot}deg)` }} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
    </span>
  );
}

/** 체력 막대 */
export function FitnessBar({ value }: { value: number }) {
  const c = value >= 85 ? 'bg-neon' : value >= 70 ? 'bg-[#a6f08a]' : value >= 55 ? 'bg-amber' : 'bg-red';
  return (
    <div className="flex items-center gap-2" title={`체력 ${Math.round(value)}%`}>
      <div className="h-1 w-14 overflow-hidden rounded-full bg-ink-700"><div className={`h-full rounded-full ${c}`} style={{ width: `${value}%` }} /></div>
      <span className="tnum w-7 text-[12px] text-mid">{Math.round(value)}</span>
    </div>
  );
}

export function ResultDot({ r }: { r: 'W' | 'D' | 'L' }) {
  const c = r === 'W' ? 'bg-neon text-ink-950' : r === 'D' ? 'bg-ink-700 text-mid' : 'bg-red/80 text-ink-950';
  return <span className={`inline-grid h-5 w-5 place-items-center rounded text-[11px] font-semibold ${c}`}>{r === 'W' ? '승' : r === 'D' ? '무' : '패'}</span>;
}

export function Card({ title, action, children, className = '' }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`panel flex min-h-0 flex-col ${className}`}>
      {title && (
        <header className="flex h-11 shrink-0 items-center justify-between px-5 shadow-[inset_0_-1px_0_var(--color-line)]">
          <h3 className="text-[13px] font-semibold text-mid">{title}</h3>
          {action}
        </header>
      )}
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}
