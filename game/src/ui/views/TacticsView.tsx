import type { Position } from '../../data/types';
import { FORMATIONS, matchRules, pickLineup } from '../../engine/squad';
import { slotRating } from '../../engine/ratings';
import { playerKo } from '../../data/db';
import { useGame } from '../../store/game';
import { useWorld } from '../hooks';
import { ratingTone } from '../format';
import { Card } from '../components/bits';
import type { Mentality, Pressing } from '../../engine/types';

export const MENTALITY: { v: Mentality; label: string }[] = [
  { v: -2, label: '매우 수비적' }, { v: -1, label: '수비적' }, { v: 0, label: '균형' }, { v: 1, label: '공격적' }, { v: 2, label: '매우 공격적' },
];
export const PRESSING: { v: Pressing; label: string }[] = [{ v: 0, label: '낮음' }, { v: 1, label: '보통' }, { v: 2, label: '높음' }];

// 피치 위 자리 좌표 (가로 0~100, 세로 0=상대 골문 ~ 100=우리 골문)
export function slotXY(slots: Position[]): { x: number; y: number }[] {
  const rowY: Record<string, number> = { GK: 92, CB: 75, LB: 72, RB: 72, LWB: 62, RWB: 62, DM: 60, CM: 48, LM: 44, RM: 44, AM: 32, LW: 24, RW: 24, ST: 13 };
  const rows = new Map<number, number[]>();
  slots.forEach((s, i) => { const y = rowY[s]; rows.set(y, [...(rows.get(y) ?? []), i]); });
  const out: { x: number; y: number }[] = new Array(slots.length);
  for (const [y, idx] of rows) {
    // 오른쪽(R) 자리는 오른편, 왼쪽(L)은 왼편, 가운데는 고르게
    const left = idx.filter((i) => slots[i].startsWith('L')), right = idx.filter((i) => slots[i].startsWith('R'));
    const mid = idx.filter((i) => !left.includes(i) && !right.includes(i));
    left.forEach((i) => (out[i] = { x: 12, y }));
    right.forEach((i) => (out[i] = { x: 88, y }));
    mid.forEach((i, k) => (out[i] = { x: mid.length === 1 ? 50 : 26 + (48 * k) / (mid.length - 1), y }));
  }
  return out;
}

export function Pitch({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative aspect-[68/90] w-full overflow-hidden rounded-[6px] bg-[linear-gradient(180deg,#0d1a10,#0a130c)] ring-1 ring-line">
      <svg viewBox="0 0 68 90" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden>
        <g stroke="rgb(57 255 20 / 0.16)" strokeWidth="0.35" fill="none">
          <rect x="2" y="2" width="64" height="86" /><line x1="2" y1="45" x2="66" y2="45" /><circle cx="34" cy="45" r="7" />
          <rect x="16" y="2" width="36" height="13" /><rect x="25" y="2" width="18" height="5" />
          <rect x="16" y="75" width="36" height="13" /><rect x="25" y="83" width="18" height="5" />
        </g>
      </svg>
      {children}
    </div>
  );
}

export function TacticsView() {
  const w = useWorld();
  const setClubTactics = useGame((s) => s.setClubTactics);
  const club = w.clubs[w.userClubId];
  const t = club.tactics;
  const squad = club.squad.map((id) => w.players[id]);
  const lineup = pickLineup(squad, t.formation, matchRules(w.season).benchSize);
  const pos = slotXY(lineup.starters.map((s) => s.slot));

  const seg = <T extends number>(opts: { v: T; label: string }[], value: T, on: (v: T) => void) => (
    <div className="flex gap-1 rounded-[5px] bg-ink-900 p-1">
      {opts.map((o) => (
        <button key={o.v} onClick={() => on(o.v)} className={`h-8 flex-1 rounded-[4px] text-[12.5px] transition-colors ${value === o.v ? 'bg-ink-700 font-semibold text-hi' : 'text-mid hover:text-hi'}`}>{o.label}</button>
      ))}
    </div>
  );

  return (
    <div className="flex h-full gap-5 p-6">
      <div className="w-[440px] shrink-0">
        <Pitch>
          {lineup.starters.map((s, i) => {
            const p = w.players[s.id];
            const r = Math.round(slotRating(p, s.slot));
            return (
              <div key={s.id} className="absolute flex w-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center" style={{ left: `${pos[i].x}%`, top: `${pos[i].y}%` }}>
                <div className="grid h-9 w-9 place-items-center rounded-full bg-ink-950/90 text-[13px] font-bold ring-2 ring-neon/70 shadow-[0_0_14px_rgb(57_255_20/0.25)]">{p.number ?? ''}</div>
                <div className="mt-1 max-w-full truncate rounded-[3px] bg-ink-950/80 px-1.5 text-[11.5px] font-semibold">{playerKo(p.id, p.name).split(' ').slice(-1)[0]}</div>
                <div className="text-[10.5px] text-lo">{s.slot} · <span className={ratingTone(r)}>{r}</span></div>
              </div>
            );
          })}
        </Pitch>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <Card title="포메이션">
          <div className="grid grid-cols-5 gap-1.5 p-4">
            {Object.keys(FORMATIONS).map((f) => (
              <button key={f} onClick={() => setClubTactics({ formation: f })}
                className={`tnum h-9 rounded-[4px] text-[13px] transition-colors ${t.formation === f ? 'bg-neon font-bold text-ink-950' : 'bg-ink-900 text-mid ring-1 ring-line hover:text-hi'}`}>{f}</button>
            ))}
          </div>
        </Card>
        <Card title="팀 성향">
          <div className="space-y-4 p-4">
            <div><div className="mb-2 text-[12px] text-lo">공격 · 수비 성향</div>{seg(MENTALITY, t.mentality, (v) => setClubTactics({ mentality: v }))}</div>
            <div><div className="mb-2 text-[12px] text-lo">압박 강도 <span className="text-lo">— 높으면 상대 기회 ↓, 체력 소모 ↑</span></div>{seg(PRESSING, t.pressing, (v) => setClubTactics({ pressing: v }))}</div>
          </div>
        </Card>
        <Card title="후보 (자동 선택)" className="flex-1">
          <div className="grid grid-cols-2 gap-x-6 px-5 py-3 text-[13px]">
            {lineup.bench.map((id) => { const p = w.players[id]; return (
              <div key={id} className="flex items-center gap-2 py-1"><span className="w-9 text-[11px] font-bold text-lo">{p.pos}</span><span className="truncate">{playerKo(p.id, p.name)}</span></div>
            ); })}
          </div>
          <p className="px-5 pb-4 text-[12px] text-lo">선발은 체력과 자리 적합도로 자동 선택됩니다. 직접 지정은 다음 단계에서 추가됩니다.</p>
        </Card>
      </div>
    </div>
  );
}
