import { useEffect, useState } from 'react';
import { useGame } from '../../store/game';
import { useWorld } from '../hooks';
import { clubKo, leagues, playerKo } from '../../data/db';
import { SEGMENTS, type TeamInMatch } from '../../engine/match';
import { slotRating } from '../../engine/ratings';
import type { Side } from '../../engine/types';
import { Crest } from '../components/Crest';
import { Icon } from '../components/Icon';
import { ConditionIcon, PosTag } from '../components/bits';
import { MENTALITY, PRESSING } from '../views/TacticsView';
import { ratingTone } from '../format';

const SPEEDS = [{ label: '보통', ms: 1100 }, { label: '빠르게', ms: 450 }, { label: '매우 빠르게', ms: 150 }];

export function MatchScreen() {
  const w = useWorld();
  const { match: m, kickOff, stepMatch, changeTactics, sub, closeMatch } = useGame();
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(0);
  const [subOut, setSubOut] = useState<string | null>(null);

  const live = m?.phase === 'live';
  useEffect(() => {
    if (!live || !playing) return;
    const t = setInterval(() => stepMatch(1), SPEEDS[speed].ms);
    return () => clearInterval(t);
  }, [live, playing, speed, stepMatch]);

  if (!m) return null;
  const s = m.state, sum = s.summary;
  const me = s[m.side], opp = s[m.side === 'home' ? 'away' : 'home'];
  const minute = Math.min(90, s.segment * 5);
  const name = (id: string) => playerKo(id, w.players[id]?.name ?? id);
  const lg = leagues.find((l) => l.id === m.fixture.league)?.ko;

  // 사건 목록 (골·카드·부상·교체)
  type Ev = { minute: number; side: Side; kind: 'goal' | 'yellow' | 'red' | 'injury' | 'sub'; text: string; sub?: string };
  const evs: Ev[] = [
    ...sum.goals.map((g) => ({ minute: g.minute, side: g.side, kind: 'goal' as const, text: name(g.scorer), sub: g.assist ? `도움 ${name(g.assist)}` : undefined })),
    ...sum.cards.map((c) => ({ minute: c.minute, side: c.side, kind: c.red ? 'red' as const : 'yellow' as const, text: name(c.player) })),
    ...sum.injuries.map((c) => ({ minute: c.minute, side: c.side, kind: 'injury' as const, text: name(c.player), sub: w.players[c.player].injury?.label })),
    ...(['home', 'away'] as Side[]).flatMap((side) => Object.entries(s[side].played).filter(([, p]) => p.from > 0)
      .map(([id, p]) => ({ minute: p.from, side, kind: 'sub' as const, text: name(id), sub: '교체 투입' }))),
  ].sort((a, b) => b.minute - a.minute);
  const goalsSoFar = { home: sum.goals.filter((g) => g.side === 'home').length, away: sum.goals.filter((g) => g.side === 'away').length };
  const xg = { home: s.home.xg, away: s.away.xg };
  const poss = s.segment ? Math.round((s.home.possSum / s.segment) * 100) : 50;

  const doSub = (inId: string) => { if (subOut && sub(subOut, inId)) setSubOut(null); };

  return (
    <div className="flex h-full flex-col bg-ink-950">
      {/* 점수판 */}
      <header className="relative shrink-0 overflow-hidden border-b border-line bg-ink-900">
        <div className="relative mx-auto flex max-w-[1100px] items-center justify-between px-8 py-5">
          <TeamHead club={s.home.clubId} mine={m.side === 'home'} align="right" />
          <div className="flex flex-col items-center">
            <div className="text-[11px] font-semibold text-lo">{lg} · {m.fixture.round}라운드</div>
            <div className="led mt-2 text-[56px] leading-none font-medium text-neon">
              {goalsSoFar.home}<span className="mx-3 text-lo">:</span>{goalsSoFar.away}
            </div>
            <div className={`led mt-2 rounded-md px-2.5 py-0.5 text-[13px] font-semibold ${m.phase === 'live' ? 'bg-neon/15 text-neon' : 'bg-ink-700 text-mid'}`}>
              {m.phase === 'pre' ? '경기 전' : m.phase === 'full' ? '경기 종료' : `${minute}'`}
            </div>
          </div>
          <TeamHead club={s.away.clubId} mine={m.side === 'away'} align="left" />
        </div>
        <div className="h-1 w-full bg-ink-800"><div className="h-full origin-left bg-neon transition-transform duration-500 ease-[var(--ease-out-quart)]" style={{ transform: `scaleX(${s.segment / SEGMENTS})` }} /></div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[340px_1fr_380px] gap-5 p-5">
        {/* 상대 선수 / 경기 기록 */}
        <section className="panel flex min-h-0 flex-col">
          <h3 className="flex h-11 shrink-0 items-center px-5 text-[13px] font-semibold text-mid shadow-[inset_0_-1px_0_var(--color-line)]">경기 기록</h3>
          <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
            {evs.length === 0 && <div className="px-3 py-4 text-[13px] text-lo">{m.phase === 'pre' ? '킥오프를 기다리는 중' : '아직 큰 사건이 없습니다'}</div>}
            {evs.map((e, i) => (
              <div key={i} className={`flex items-center gap-3 rounded-md px-3 py-2 text-[13px] ${e.kind === 'goal' ? 'bg-neon-ghost' : ''}`}>
                <span className="tnum w-8 text-right text-lo">{e.minute}'</span>
                <EventIcon kind={e.kind} />
                <div className="min-w-0 flex-1">
                  <div className={`truncate ${e.kind === 'goal' ? 'font-semibold' : ''}`}>{e.text}</div>
                  {e.sub && <div className="truncate text-[11px] text-lo">{e.sub}</div>}
                </div>
                <Crest clubId={s[e.side].clubId} size={14} />
              </div>
            ))}
          </div>
        </section>

        {/* 가운데: 통계 + 조작 */}
        <section className="flex min-h-0 flex-col gap-5">
          <div className="panel px-6 py-5">
            {([
              ['점유율', poss, 100 - poss, (v: number) => `${v}%`],
              ['슈팅', s.home.shots, s.away.shots, String],
              ['유효 슈팅', s.home.onTarget, s.away.onTarget, String],
              ['기대 득점', xg.home, xg.away, (v: number) => v.toFixed(2)],
            ] as const).map(([k, h, a, fmt]) => (
              <div key={k} className="mb-3 last:mb-0">
                <div className="mb-1 flex justify-between text-[13px]"><span className="tnum font-semibold">{fmt(h)}</span><span className="text-lo">{k}</span><span className="tnum font-semibold">{fmt(a)}</span></div>
                <div className="flex h-1.5 gap-1">
                  <div className="flex-1 overflow-hidden rounded-full bg-ink-700"><div className={`ml-auto h-full rounded-full ${m.side === 'home' ? 'bg-neon' : 'bg-mid'}`} style={{ width: `${(h / (h + a || 1)) * 100}%` }} /></div>
                  <div className="flex-1 overflow-hidden rounded-full bg-ink-700"><div className={`h-full rounded-full ${m.side === 'away' ? 'bg-neon' : 'bg-mid'}`} style={{ width: `${(a / (h + a || 1)) * 100}%` }} /></div>
                </div>
              </div>
            ))}
          </div>

          <div className="panel space-y-4 px-6 py-5">
            <div>
              <div className="mb-2 text-[12px] text-lo">공격 · 수비 성향</div>
              <div className="flex gap-1 rounded-lg bg-ink-900 p-1">
                {MENTALITY.map((o) => (
                  <button key={o.v} disabled={m.phase === 'full'} onClick={() => changeTactics({ mentality: o.v })}
                    className={`h-8 flex-1 rounded-md text-[12px] ${me.tactics.mentality === o.v ? 'bg-ink-700 font-semibold text-hi' : 'text-mid hover:text-hi'}`}>{o.label}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 text-[12px] text-lo">압박 강도</div>
              <div className="flex gap-1 rounded-lg bg-ink-900 p-1">
                {PRESSING.map((o) => (
                  <button key={o.v} disabled={m.phase === 'full'} onClick={() => changeTactics({ pressing: o.v })}
                    className={`h-8 flex-1 rounded-md text-[12px] ${me.tactics.pressing === o.v ? 'bg-ink-700 font-semibold text-hi' : 'text-mid hover:text-hi'}`}>{o.label}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-auto flex items-center gap-2">
            {m.phase === 'pre' && (
              <button onClick={kickOff} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-neon text-[15px] font-semibold text-ink-950 hover:bg-[#5bff3d]">
                킥오프 <Icon name="arrow" size={18} />
              </button>
            )}
            {m.phase === 'live' && (
              <>
                <button onClick={() => setPlaying((p) => !p)} className="h-12 w-28 rounded-lg bg-ink-700 text-[14px] font-semibold hover:bg-ink-750">{playing ? '일시정지' : '재개'}</button>
                <div className="flex h-12 flex-1 gap-1 rounded-lg bg-ink-900 p-1">
                  {SPEEDS.map((sp, i) => (
                    <button key={sp.label} onClick={() => setSpeed(i)} className={`flex-1 rounded-md text-[13px] ${speed === i ? 'bg-ink-700 font-semibold text-hi' : 'text-mid hover:text-hi'}`}>{sp.label}</button>
                  ))}
                </div>
              </>
            )}
            {m.phase !== 'full' ? (
              <button onClick={closeMatch} className="h-12 rounded-lg px-4 text-[13px] text-lo ring-1 ring-line hover:text-hi">결과만 보기</button>
            ) : (
              <button onClick={closeMatch} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-neon text-[15px] font-semibold text-ink-950 hover:bg-[#5bff3d]">
                계속 <Icon name="arrow" size={18} />
              </button>
            )}
          </div>
        </section>

        {/* 내 팀: 선수 상태 · 교체 */}
        <section className="panel flex min-h-0 flex-col">
          <h3 className="flex h-11 shrink-0 items-center justify-between px-5 text-[13px] font-semibold text-mid shadow-[inset_0_-1px_0_var(--color-line)]">
            <span>{clubKo(me.clubId)} · {me.tactics.formation}</span>
            <span className="tnum text-[12px] text-lo">교체 {me.subsUsed}/{me.maxSubs}</span>
          </h3>
          <div className="min-h-0 flex-1 overflow-auto">
            <TeamList team={me} selectable={m.phase === 'live' && me.subsUsed < me.maxSubs} selected={subOut} onSelect={(id) => setSubOut(id === subOut ? null : id)} ratings={sum.ratings} />
            <div className="px-5 pt-3 pb-1 text-[11px] font-semibold text-lo">
              후보 {subOut && <span className="ml-1 font-normal tracking-normal text-neon">— {name(subOut)} 대신 투입할 선수 선택</span>}
            </div>
            {me.bench.map((id) => {
              const p = w.players[id];
              const outSlot = subOut ? me.onPitch.find((o) => o.id === subOut)?.slot : null;
              return (
                <button key={id} disabled={!subOut} onClick={() => doSub(id)}
                  className={`flex w-full items-center gap-3 px-5 py-2 text-left text-[13px] ${subOut ? 'hover:bg-neon-ghost' : 'opacity-70'}`}>
                  <PosTag pos={p.pos} />
                  <span className="flex-1 truncate">{name(id)}</span>
                  {outSlot && <span className={`tnum text-[12px] font-semibold ${ratingTone(slotRating(p, outSlot))}`}>{Math.round(slotRating(p, outSlot))}</span>}
                  <ConditionIcon value={p.condition} />
                </button>
              );
            })}
          </div>
          <div className="border-t border-line px-5 py-3 text-[12px] text-lo">상대 · {clubKo(opp.clubId)} {opp.tactics.formation}</div>
        </section>
      </div>
    </div>
  );
}

function TeamHead({ club, mine, align }: { club: string; mine: boolean; align: 'left' | 'right' }) {
  return (
    <div className={`flex w-[320px] items-center gap-4 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}>
      <Crest clubId={club} size={48} />
      <div>
        <div className="text-[20px] font-semibold">{clubKo(club)}</div>
        {mine && <div className="text-[11px] font-semibold text-neon">내 구단</div>}
      </div>
    </div>
  );
}

function TeamList({ team, selectable, selected, onSelect, ratings }: { team: TeamInMatch; selectable: boolean; selected: string | null; onSelect: (id: string) => void; ratings: Record<string, number> }) {
  const w = useWorld();
  return (
    <div className="py-1">
      {team.onPitch.map((o) => {
        const p = w.players[o.id];
        const c = o.fitness >= 75 ? 'bg-neon' : o.fitness >= 60 ? 'bg-[#a6f08a]' : o.fitness >= 45 ? 'bg-amber' : 'bg-red';
        return (
          <button key={o.id} disabled={!selectable} onClick={() => onSelect(o.id)}
            className={`flex w-full items-center gap-3 px-5 py-1.5 text-left text-[13px] ${selected === o.id ? 'bg-neon-ghost' : selectable ? 'hover:bg-ink-800' : ''}`}>
            <span className="w-8 text-[11px] font-semibold text-lo">{o.slot}</span>
            <span className="flex-1 truncate">{playerKo(p.id, p.name)}{o.yellow && <span className="ml-1.5 inline-block h-3 w-2 rounded-[1px] bg-amber align-middle" />}</span>
            {ratings[o.id] != null && <span className="tnum text-[12px] text-mid">{ratings[o.id].toFixed(1)}</span>}
            <div className="h-1 w-12 overflow-hidden rounded-full bg-ink-700" title={`체력 ${Math.round(o.fitness)}`}><div className={`h-full rounded-full ${c}`} style={{ width: `${o.fitness}%` }} /></div>
          </button>
        );
      })}
    </div>
  );
}

function EventIcon({ kind }: { kind: 'goal' | 'yellow' | 'red' | 'injury' | 'sub' }) {
  if (kind === 'goal') return <BallIcon />;
  if (kind === 'yellow') return <span className="mx-1.5 inline-block h-4 w-3 rounded-[2px] bg-amber" />;
  if (kind === 'red') return <span className="mx-1.5 inline-block h-4 w-3 rounded-[2px] bg-red" />;
  if (kind === 'injury') return <span className="grid h-5 w-5 place-items-center rounded-full bg-red/20 text-[12px] font-semibold text-red">+</span>;
  return <span className="grid h-5 w-5 place-items-center text-sky"><Icon name="transfers" size={15} /></span>;
}

/** 골 표시용 축구공 */
function BallIcon() {
  return (
    <svg width={20} height={20} viewBox="-12 -12 24 24" aria-label="골" className="shrink-0">
      <circle r={11} fill="#f4f4f2" stroke="#0d100e" strokeWidth={0.8} />
      <path d="M0 -4.2 L4 -1.3 L2.5 3.4 L-2.5 3.4 L-4 -1.3 Z" fill="#141414" />
      <path d="M0 -4.2 V-8.5 M4 -1.3 L8.2 -2.6 M2.5 3.4 L5 7.2 M-2.5 3.4 L-5 7.2 M-4 -1.3 L-8.2 -2.6" stroke="#141414" strokeWidth={0.9} fill="none" />
      <g fill="#141414">
        <path d="M-2.6 -10.6 L2.6 -10.6 L0 -8.5 Z" /><path d="M10.4 -1 L9 3.6 L8.2 -2.6 Z" /><path d="M-10.4 -1 L-9 3.6 L-8.2 -2.6 Z" />
        <path d="M3.2 10.4 L7.5 7.6 L5 7.2 Z" /><path d="M-3.2 10.4 L-7.5 7.6 L-5 7.2 Z" />
      </g>
    </svg>
  );
}
