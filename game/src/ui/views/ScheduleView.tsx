import { useState } from 'react';
import type { Fixture, World } from '../../engine/types';
import { clubKo, compKo, playerKo } from '../../data/db';
import { allFixtures } from '../../engine/world';
import { Crest } from '../components/Crest';
import { ResultDot } from '../components/bits';
import { koDate, roundLabel } from '../format';
import { useWorld } from '../hooks';

export const userFixtures = (w: World): Fixture[] =>
  allFixtures(w).filter((f) => f.home === w.userClubId || f.away === w.userClubId).sort((a, b) => a.date.localeCompare(b.date));

export function resultFor(f: Fixture, club: string): 'W' | 'D' | 'L' | null {
  if (!f.result) return null;
  const [g, o] = f.home === club ? [f.result.homeGoals, f.result.awayGoals] : [f.result.awayGoals, f.result.homeGoals];
  return g > o ? 'W' : g === o ? 'D' : 'L';
}

export function ScheduleView() {
  const w = useWorld();
  const list = userFixtures(w);
  const [open, setOpen] = useState<string | null>(null);
  const sel = list.find((f) => f.id === open) ?? null;

  return (
    <div className="flex h-full gap-5 p-6">
      <div className="panel min-w-0 flex-1 overflow-auto">
        {list.map((f) => {
          const home = f.home === w.userClubId;
          const opp = home ? f.away : f.home;
          const r = resultFor(f, w.userClubId);
          const today = f.date === w.date && !f.result;
          return (
            <button key={f.id} onClick={() => f.result && setOpen(f.id)}
              className={`flex h-12 w-full items-center gap-4 px-5 text-left text-[14px] shadow-[inset_0_-1px_0_var(--color-line)] transition-colors ${
                open === f.id ? 'bg-neon-ghost' : today ? 'bg-ink-800' : f.result ? 'hover:bg-ink-800' : ''}`}>
              {f.stage === 'cup' || f.stage === 'euro'
                ? <span className={`w-44 truncate text-[12px] font-semibold ${f.stage === 'euro' ? 'text-sky' : 'text-amber'}`} title={compKo(f.league)}>{compKo(f.league)} · {f.name}</span>
                : <span className="tnum w-44 truncate text-[12px] text-lo">{f.stage ? roundLabel(f) : `R${f.round}`}</span>}
              <span className="tnum w-40 text-mid">{koDate(f.date)}</span>
              <span className={`w-10 rounded py-0.5 text-center text-[11px] font-semibold ${home ? 'bg-ink-700 text-hi' : 'text-lo ring-1 ring-line'}`}>{home ? '홈' : '원정'}</span>
              <Crest clubId={opp} size={18} />
              <span className="flex-1 truncate font-semibold">{clubKo(opp)}</span>
              {f.result ? (
                <>{f.result.pens && <span className="text-[11px] text-lo" title="승부차기">PK {(f.result.pens === 'home') === home ? '승' : '패'}</span>}
                  <span className="tnum w-14 text-right font-semibold">{home ? `${f.result.homeGoals} - ${f.result.awayGoals}` : `${f.result.awayGoals} - ${f.result.homeGoals}`}</span><ResultDot r={r!} /></>
              ) : today ? <span className="text-[12px] font-semibold text-neon">오늘</span> : <span className="text-[12px] text-lo">예정</span>}
            </button>
          );
        })}
      </div>
      {sel?.result && <MatchReport f={sel} />}
    </div>
  );
}

export function MatchReport({ f }: { f: Fixture }) {
  const w = useWorld();
  const r = f.result!;
  const name = (id: string) => playerKo(id, w.players[id]?.name ?? id);
  const statRows: [string, number, number, (v: number) => string][] = [
    ['점유율', r.stats.home.possession, r.stats.away.possession, (v) => `${v}%`],
    ['슈팅', r.stats.home.shots, r.stats.away.shots, String],
    ['유효 슈팅', r.stats.home.onTarget, r.stats.away.onTarget, String],
    ['기대 득점', r.stats.home.xg, r.stats.away.xg, (v) => v.toFixed(2)],
  ];
  return (
    <aside className="panel w-[380px] shrink-0 animate-[fade_0.2s_ease-out] overflow-auto">
      <div className="flex items-center justify-between px-6 pt-6 pb-5">
        {[f.home, f.away].map((c, i) => (
          <div key={c} className={`flex w-24 flex-col items-center gap-2 ${i ? 'order-3' : ''}`}><Crest clubId={c} size={34} /><span className="text-center text-[12px] font-semibold">{clubKo(c)}</span></div>
        ))}
        <div className="tnum order-2 text-[34px] font-semibold">{r.homeGoals} <span className="text-lo">-</span> {r.awayGoals}</div>
      </div>
      <div className="space-y-1 border-t border-line px-6 py-4 text-[13px]">
        {r.goals.map((g, i) => (
          <div key={i} className={`flex gap-2 ${g.side === 'away' ? 'flex-row-reverse text-right' : ''}`}>
            <span className="tnum w-8 text-lo">{g.minute}'</span>
            <span><span className="font-semibold">{name(g.scorer)}</span>{g.assist && <span className="text-lo"> ({name(g.assist)})</span>}</span>
          </div>
        ))}
        {r.cards.filter((c) => c.red).map((c, i) => (
          <div key={'r' + i} className={`flex gap-2 text-red ${c.side === 'away' ? 'flex-row-reverse text-right' : ''}`}><span className="tnum w-8">{c.minute}'</span><span>퇴장 · {name(c.player)}</span></div>
        ))}
      </div>
      <div className="space-y-3 border-t border-line px-6 py-5">
        {statRows.map(([k, h, a, fmt]) => (
          <div key={k}>
            <div className="mb-1 flex justify-between text-[12px]"><span className="tnum font-semibold">{fmt(h)}</span><span className="text-lo">{k}</span><span className="tnum font-semibold">{fmt(a)}</span></div>
            <div className="flex h-1 gap-1"><div className="flex-1 overflow-hidden rounded-full bg-ink-700"><div className="ml-auto h-full rounded-full bg-neon" style={{ width: `${(h / (h + a || 1)) * 100}%` }} /></div>
              <div className="flex-1 overflow-hidden rounded-full bg-ink-700"><div className="h-full rounded-full bg-mid" style={{ width: `${(a / (h + a || 1)) * 100}%` }} /></div></div>
          </div>
        ))}
      </div>
    </aside>
  );
}
