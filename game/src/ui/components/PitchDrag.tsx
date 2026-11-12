// 피치 위 선수 끌어다 놓기 (전술 · 경기 준비 공통). 마우스 · 손가락 모두 (Pointer Events)
//  - 살짝 누르고 떼면: 그 자리 선택 (onTap)
//  - 끌어서 다른 자리에 놓으면: 두 자리 선수 맞바꿈 (onDrop) — 예: LW ↔ RW
//  자리 버튼에 data-slot 이 있어야 하고, 끌 때 화면이 스크롤되지 않도록 touch-action: none
import { useRef, useState, type PointerEvent as RPointerEvent } from 'react';

const slotAt = (x: number, y: number) => {
  const el = document.elementFromPoint(x, y)?.closest('[data-slot]');
  return el ? Number(el.getAttribute('data-slot')) : null;
};

export function usePitchDrag(onTap: (i: number) => void, onDrop: (from: number, to: number) => void) {
  const drag = useRef<{ i: number; x: number; y: number; moved: boolean } | null>(null);
  const [ghost, setGhost] = useState<{ i: number; x: number; y: number } | null>(null);
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
      setGhost({ i: d.i, x: e.clientX, y: e.clientY });
      setOver(slotAt(e.clientX, e.clientY));
    },
    onPointerUp: (e: RPointerEvent<HTMLElement>) => {
      const d = drag.current;
      end();
      if (!d) return;
      if (!d.moved) { onTap(d.i); return; }
      const to = slotAt(e.clientX, e.clientY);
      if (to != null && to !== d.i) onDrop(d.i, to);
    },
    onPointerCancel: end,
    // 키보드(Enter · Space)로 누를 때만 (마우스 · 손가락은 위에서 처리)
    onClick: (e: React.MouseEvent) => { if (e.detail === 0) onTap(i); },
  });
  return { bind, ghost, over };
}

/** 끄는 동안 손가락 · 마우스를 따라다니는 선수 표시 */
export function DragGhost({ ghost, label, number }: { ghost: { x: number; y: number } | null; label: string; number?: number | null }) {
  if (!ghost) return null;
  return (
    <div className="pointer-events-none fixed z-[80] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center" style={{ left: ghost.x, top: ghost.y }}>
      <div className="grid h-11 w-11 place-items-center rounded-full bg-neon text-[14px] font-semibold text-ink-950 shadow-[0_6px_20px_rgb(0_0_0/0.5)] ring-2 ring-neon">{number ?? ''}</div>
      <div className="mt-1 rounded bg-ink-950/90 px-1.5 text-[12px] font-semibold">{label}</div>
    </div>
  );
}
