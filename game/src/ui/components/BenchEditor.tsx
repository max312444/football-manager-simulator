// 후보 명단 고치기 (전술 · 경기 준비 공통): 후보에서 빼기 (✕) · 명단 밖 선수 넣기 (+)
//  선발 ↔ 후보 교체는 피치의 자리를 눌러 그 자리에 넣을 선수를 고르면 된다
import type { PlayerState } from '../../engine/types';
import { available } from '../../engine/squad';
import { playerKo } from '../../data/db';
import { ConditionIcon, FitnessBar, PosTag } from './bits';

export function BenchEditor({ squad, starters, bench, size, onChange }: {
  squad: PlayerState[]; starters: (string | null)[]; bench: string[]; size: number; onChange: (bench: string[]) => void;
}) {
  const inXI = new Set(starters.filter(Boolean) as string[]);
  const outside = squad.filter((p) => !inXI.has(p.id) && !bench.includes(p.id)).sort((a, b) => +available(b) - +available(a) || a.pos.localeCompare(b.pos));
  const full = bench.length >= size;
  const row = (p: PlayerState, action: React.ReactNode) => (
    <div key={p.id} className="flex items-center gap-2 py-1.5 text-[13px]">
      <PosTag pos={p.pos} />
      <span className="min-w-0 flex-1 truncate">{playerKo(p.id, p.name)}{!available(p) && <span className="ml-2 text-[11px] text-red">{p.injury ? '부상' : '징계'}</span>}</span>
      <ConditionIcon value={p.condition} />
      <FitnessBar value={p.fitness} />
      {action}
    </div>
  );
  return (
    <div className="px-5 py-3">
      <div className="mb-1 text-[12px] text-lo">후보 {bench.length} / {size}명 · 선발과 바꾸려면 피치의 자리를 누르세요</div>
      {bench.map((id) => { const p = squad.find((x) => x.id === id); return p ? row(p, <button onClick={() => onChange(bench.filter((x) => x !== id))} title="후보에서 빼기" className="h-7 w-7 shrink-0 rounded-md text-lo ring-1 ring-line hover:text-red">✕</button>) : null; })}
      {outside.length > 0 && (
        <details className="mt-2 border-t border-line pt-2">
          <summary className="cursor-pointer text-[12px] text-mid hover:text-hi">명단 밖 선수 {outside.length}명 {full ? '(후보가 꽉 찼습니다 · 먼저 빼세요)' : '· 눌러서 후보에 넣기'}</summary>
          {outside.map((p) => row(p, <button disabled={full || !available(p)} onClick={() => onChange([...bench, p.id])} title="후보에 넣기" className="h-7 w-7 shrink-0 rounded-md text-neon ring-1 ring-line hover:bg-neon-ghost disabled:text-lo disabled:opacity-40">+</button>))}
        </details>
      )}
    </div>
  );
}
