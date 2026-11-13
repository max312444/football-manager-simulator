// 경기 중 피치 배치도 (전술 화면과 같은 모양) + 아래 후보 줄
//  - 선수 누르기: 교체할 선수 선택 → 후보를 누르면 교체
//  - 후보를 피치의 선수 위로 끌어 놓기: 바로 교체 (그 자리에 맞는 선수만)
//  - 피치 선수끼리 끌어 놓기: 자리 맞바꿈 · 빈 곳으로 끌기: 새 포지션 → 포메이션이 바뀜
import type { Position } from '../../data/types';
import { canSubInto, slotOrder, type TeamInMatch } from '../../engine/match';
import { slotRating } from '../../engine/ratings';
import { FORMATIONS } from '../../engine/squad';
import { playerKo } from '../../data/db';
import { useWorld } from '../hooks';
import { Pitch, slotXY } from '../views/TacticsView';
import { DragGhost, usePitchDrag } from './PitchDrag';
import { ratingTone } from '../format';

const BENCH = 100;   // 후보 칸 번호 (피치 자리와 구분)

export function LivePitch({ team, ratings, editable, selected, onSelect, onSub, onSwap, onReshape, side }: {
  team: TeamInMatch; ratings: Record<string, number>; editable: boolean;
  selected: string | null; onSelect: (id: string | null) => void;
  onSub: (outId: string, inId: string) => void; onSwap: (a: string, b: string) => void; onReshape: (slotIdx: number, pos: Position) => void;
  /** 후보 칸 오른쪽에 놓을 것 (성향 · 압박) */
  side?: React.ReactNode;
}) {
  const w = useWorld();
  const slots = FORMATIONS[team.tactics.formation] ?? [];
  const xy = slotXY(slots);
  const order = slotOrder(team);
  const canSub = editable && team.subsUsed < team.maxSubs;
  const short = (id: string) => playerKo(id, w.players[id]?.name ?? id).split(' ').slice(-1)[0];
  const idAt = (i: number) => (i >= BENCH ? team.bench[i - BENCH] : order[i]?.id) ?? null;

  const { bind, ghost, over } = usePitchDrag(
    (i) => {
      if (!editable) return;
      if (i >= BENCH) { const inId = team.bench[i - BENCH]; if (selected && canSub && inId) onSub(selected, inId); return; }
      const id = order[i]?.id ?? null;
      onSelect(id === selected ? null : id);
    },
    (from, to) => {
      if (!editable) return;
      const a = idAt(from), b = idAt(to);
      if (!a || !b) return;
      if (from >= BENCH && to < BENCH) { if (canSub) onSub(b, a); }        // 후보 → 피치: 교체
      else if (from < BENCH && to >= BENCH) { if (canSub) onSub(a, b); }   // 피치 → 후보: 교체
      else if (from < BENCH && to < BENCH) onSwap(a, b);                  // 피치끼리: 자리 맞바꿈
    },
    (i, pos) => { if (editable && i < BENCH) onReshape(i, pos); },
  );
  const ghostId = ghost ? idAt(ghost.i) : null;
  // 끄는 후보가 들어갈 수 있는 자리 표시
  const dragIn = ghost && ghost.i >= BENCH && ghostId ? w.players[ghostId] : null;
  const selIn = selected ? team.onPitch.find((o) => o.id === selected)?.slot ?? null : null;

  // PC(넓은 화면): [후보 | 피치 | 성향 · 압박] 한 화면 · 휴대폰: 피치 → 후보 → 성향 세로
  return (
    <div className="grid items-start gap-3 xl:grid-cols-[minmax(200px,1fr)_auto_minmax(220px,1fr)] xl:gap-4">
      {/* 피치: 화면 높이에 맞춰 (PC), 휴대폰은 가로 꽉 */}
      <div className="mx-auto w-full max-w-[460px] xl:order-2 xl:w-[max(300px,min(460px,calc((100dvh-540px)*0.755)))]">
      <Pitch>
        {slots.map((slot, i) => {
          const o = order[i];
          if (!o) return <div key={i} className="absolute -translate-x-1/2 -translate-y-1/2 text-[11px] text-red/70" style={{ left: `${xy[i].x}%`, top: `${xy[i].y}%` }}>{slot} 빈 자리</div>;
          const p = w.players[o.id];
          const r = ratings[o.id];
          const fit = Math.round(o.fitness);
          const tone = fit >= 75 ? 'bg-neon' : fit >= 60 ? 'bg-[#a6f08a]' : fit >= 45 ? 'bg-amber' : 'bg-red';
          const fits = dragIn ? canSubInto(dragIn, slot) : true;
          const ring = ghost && over === i && ghost.i !== i ? (fits ? 'bg-sky/30 ring-2 ring-sky scale-110' : 'ring-2 ring-red') : ghost?.i === i ? 'opacity-30 ring-2 ring-neon/40' : selected === o.id ? 'bg-neon text-ink-950 ring-2 ring-neon' : dragIn && !fits ? 'opacity-40 ring-2 ring-line' : fit < 55 ? 'ring-2 ring-amber' : 'ring-2 ring-neon/60';
          const b = bind(i);
          return (
            <button key={o.id} {...b} disabled={!editable}
              className="absolute flex w-20 -translate-x-1/2 -translate-y-1/2 cursor-grab flex-col items-center select-none active:cursor-grabbing disabled:cursor-default" style={{ ...b.style, left: `${xy[i].x}%`, top: `${xy[i].y}%` }}
              title={`${playerKo(o.id, p.name)} · ${slot} · 체력 ${fit}${r ? ` · 평점 ${r}` : ''}`}>
              <div className={`relative grid h-8 w-8 place-items-center rounded-full bg-ink-950/90 text-[12px] font-semibold transition-all ${ring}`}>
                {p.number ?? ''}
                {o.yellow && <span className="absolute -top-0.5 -right-1 h-3 w-2 rounded-[1px] bg-amber" />}
                {o.fromMinute > 0 && <span className="absolute -bottom-0.5 -left-1 rounded bg-sky px-0.5 text-[9px] leading-3 text-ink-950" title="교체 투입">IN</span>}
              </div>
              <div className="mt-0.5 max-w-full truncate rounded bg-ink-950/80 px-1 text-[11px] leading-4 font-semibold">{short(o.id)}</div>
              <div className="flex items-center gap-1 text-[10px] leading-3 text-lo">{slot}<span className="h-1 w-6 overflow-hidden rounded-full bg-ink-700"><span className={`block h-full ${tone}`} style={{ width: `${fit}%` }} /></span>{r != null && <span className={`tnum ${ratingTone(r * 10 + 15)}`}>{r.toFixed(1)}</span>}</div>
            </button>
          );
        })}
      </Pitch>
      </div>
      {/* 후보 (크게) */}
      <div className="rounded-lg bg-ink-900 p-3 ring-1 ring-line xl:order-1">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 px-0.5 text-[12px] text-lo">
          <span className="font-semibold text-mid">후보 {team.bench.length}명</span>
          <span>{!editable ? '' : !canSub ? '교체를 모두 썼습니다' : selected ? `${short(selected)} 대신 넣을 선수를 누르세요` : '선수를 누르고 후보를 누르거나 · 후보를 피치로 끌어 놓으면 교체'}</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-1">
          {team.bench.map((id, j) => {
            const p = w.players[id];
            const fits = !selIn || canSubInto(p, selIn);
            const b = bind(BENCH + j);
            return (
              <button key={id} {...b} disabled={!canSub}
                className={`flex h-11 min-w-0 cursor-grab items-center gap-2 rounded-lg bg-ink-800 px-2.5 text-[13px] select-none ring-1 transition-colors active:cursor-grabbing disabled:cursor-default disabled:opacity-50 ${selIn && fits ? 'ring-neon/60 hover:bg-neon-ghost' : selIn ? 'opacity-40 ring-line' : 'ring-line hover:bg-ink-750'}`} style={b.style}
                title={selIn && !fits ? '이 자리에 맞지 않는 선수입니다' : undefined}>
                <span className="tnum grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink-950 text-[12px] font-semibold text-mid ring-1 ring-line">{p.number ?? ''}</span>
                <span className="min-w-0 flex-1 truncate text-left font-semibold">{short(id)}</span>
                <span className="shrink-0 text-[11px] text-lo">{p.pos}</span>
                {selIn && <span className={`tnum text-[11px] font-semibold ${ratingTone(slotRating(p, selIn))}`}>{Math.round(slotRating(p, selIn))}</span>}
              </button>
            );
          })}
        </div>
      </div>
      {side && <div className="flex flex-col gap-4 rounded-lg bg-ink-900 p-3 ring-1 ring-line xl:order-3">{side}</div>}
      <DragGhost ghost={ghost} number={ghostId ? w.players[ghostId]?.number : null} label={ghostId ? short(ghostId) : ''} />
    </div>
  );
}
