// 피치 위 선수 끌어다 놓기 (전술 · 경기 준비 공통). 마우스 · 손가락 모두 (Pointer Events)
//  - 살짝 누르고 떼면: 그 자리 선택 (onTap)
//  - 끌어서 다른 자리에 놓으면: 두 자리 선수 맞바꿈 (onDrop) — 예: LW ↔ RW
//  - 끌어서 피치의 빈 곳에 놓으면: 그 위치의 포지션으로 자리를 바꿈 (onFree) — 예: 윙어를 가운데 위로 → ST, 포메이션이 4-4-2 등으로 바뀜
//  자리 버튼에 data-slot, 피치에 data-pitch 가 있어야 하고, 끌 때 화면이 스크롤되지 않도록 touch-action: none
import { useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { Position } from '../../data/types';
import { zonePos } from '../../engine/squad';

const slotAt = (x: number, y: number) => {
  const el = document.elementFromPoint(x, y)?.closest('[data-slot]');
  return el ? Number(el.getAttribute('data-slot')) : null;
};
/** 화면 좌표 → 피치 안 위치 (%) · 그 위치 포지션 (피치 밖이면 null) */
const zoneAt = (x: number, y: number): { x: number; y: number; pos: Position | null } | null => {
  const el = document.elementFromPoint(x, y)?.closest('[data-pitch]');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const px = ((x - r.left) / r.width) * 100, py = ((y - r.top) / r.height) * 100;
  return { x: px, y: py, pos: zonePos(px, py) };
};

export function usePitchDrag(onTap: (i: number) => void, onDrop: (from: number, to: number) => void, onFree?: (i: number, pos: Position) => void) {
  const drag = useRef<{ i: number; x: number; y: number; moved: boolean } | null>(null);
  const [ghost, setGhost] = useState<{ i: number; x: number; y: number; zone?: Position | null } | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const end = () => { drag.current = null; setGhost(null); setOver(null); };

  const bind = (i: number) => ({
    'data-slot': i,
    style: { touchAction: 'none' as const },
    onPointerDown: (e: RPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      drag.current = { i, x: e.clientX, y: e.clientY, moved: false };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: RPointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d) return;
      if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8) return;
      d.moved = true;
      const to = slotAt(e.clientX, e.clientY);
      setOver(to);
      setGhost({ i: d.i, x: e.clientX, y: e.clientY, zone: onFree && (to == null || to === d.i) ? zoneAt(e.clientX, e.clientY)?.pos ?? null : null });
    },
    onPointerUp: (e: RPointerEvent<HTMLElement>) => {
      const d = drag.current;
      end();
      if (!d) return;
      if (!d.moved) { onTap(d.i); return; }
      const to = slotAt(e.clientX, e.clientY);
      if (to != null && to !== d.i) { onDrop(d.i, to); return; }
      if (to == null && onFree) { const z = zoneAt(e.clientX, e.clientY); if (z?.pos) onFree(d.i, z.pos); }
    },
    onPointerCancel: end,
    // 키보드(Enter · Space)로 누를 때만 (마우스 · 손가락은 위에서 처리)
    onClick: (e: React.MouseEvent) => { if (e.detail === 0) onTap(i); },
  });
  return { bind, ghost, over };
}

/** 끄는 동안 손가락 · 마우스를 따라다니는 선수 표시 (빈 곳 위면 바뀔 포지션도) */
export function DragGhost({ ghost, label, number }: { ghost: { x: number; y: number; zone?: Position | null } | null; label: string; number?: number | null }) {
  if (!ghost) return null;
  return (
    <div className="pointer-events-none fixed z-[80] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center" style={{ left: ghost.x, top: ghost.y }}>
      <div className="grid h-11 w-11 place-items-center rounded-full bg-neon text-[14px] font-semibold text-ink-950 shadow-[0_6px_20px_rgb(0_0_0/0.5)] ring-2 ring-neon">{number ?? ''}</div>
      <div className="mt-1 rounded bg-ink-950/90 px-1.5 text-[12px] font-semibold">{label}</div>
      {ghost.zone && <div className="mt-1 rounded bg-sky px-1.5 text-[11px] font-semibold text-ink-950">→ {ghost.zone} 자리로</div>}
    </div>
  );
}
