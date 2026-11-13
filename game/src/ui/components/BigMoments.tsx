// 큰 경기 연출: 결승전 시작 · 승부차기 (한 번씩) · 우승 축하
import { useEffect, useMemo, useState } from 'react';
import type { ShootoutSeq } from '../../engine/shootoutSeq';
import type { Side } from '../../engine/types';
import { clubKo, playerKo } from '../../data/db';
import { useWorld } from '../hooks';
import { Crest } from './Crest';

/** 결승 (컵 · 유럽 대회 · 승격 플레이오프 결승) */
export const isFinal = (f: { stage?: string; name?: string }) =>
  ((f.stage === 'cup' || f.stage === 'euro') && /^결승/.test(f.name ?? '')) || f.stage === 'final';

function Shell({ children, onSkip, skipLabel = '건너뛰기' }: { children: React.ReactNode; onSkip?: () => void; skipLabel?: string }) {
  return (
    <div className="fixed inset-0 z-[70] grid animate-[fade_0.25s_ease-out] place-items-center overflow-hidden bg-ink-950/92 p-4 backdrop-blur-sm">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgb(57_255_20/0.10),transparent_60%)]" />
      <div className="relative w-full max-w-[640px]">{children}</div>
      {onSkip && <button onClick={onSkip} className="absolute right-4 bottom-[max(16px,env(safe-area-inset-bottom))] rounded-lg px-4 py-2 text-[13px] text-lo ring-1 ring-line hover:text-hi">{skipLabel}</button>}
    </div>
  );
}

/** 결승전 시작: 두 구단 · 대회 이름 (2.8초 뒤 자동으로 닫힘) */
export function FinalIntro({ home, away, title, onDone }: { home: string; away: string; title: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 2800); return () => clearTimeout(t); }, [onDone]);
  return (
    <Shell onSkip={onDone}>
      <div className="text-center">
        <div className="animate-[intro-zoom_0.6s_ease-out] text-[13px] font-semibold tracking-[0.3em] text-neon">{title}</div>
        <div className="mt-2 animate-[intro-pop_0.7s_ease-out] text-[52px] leading-none font-black text-hi sm:text-[72px]">결승전</div>
        <div className="mt-8 flex items-center justify-center gap-6 sm:gap-10">
          <div className="flex animate-[bm-in-left_0.7s_ease-out] flex-col items-center gap-2"><Crest clubId={home} size={72} /><span className="text-[15px] font-semibold">{clubKo(home)}</span></div>
          <span className="animate-[intro-glow_1.2s_ease-in-out_infinite] text-[22px] font-black text-lo">VS</span>
          <div className="flex animate-[bm-in-right_0.7s_ease-out] flex-col items-center gap-2"><Crest clubId={away} size={72} /><span className="text-[15px] font-semibold">{clubKo(away)}</span></div>
        </div>
        <Trophy className="mx-auto mt-8 h-16 w-16 animate-[bm-float_2s_ease-in-out_infinite] text-[#f2c94c]" />
      </div>
    </Shell>
  );
}

/** 승부차기: 한 번씩 (준비 → 결과), 점수 · 차기 기록, 끝나면 승자 */
export function ShootoutOverlay({ seq, home, away, mySide, onDone }: { seq: ShootoutSeq; home: string; away: string; mySide: Side; onDone: () => void }) {
  const w = useWorld();
  const kicks = useMemo(() => {
    const out: { side: Side; i: number }[] = [];
    for (let i = 0; i < Math.max(seq.home.length, seq.away.length); i++) {
      if (seq.home[i]) out.push({ side: 'home', i });
      if (seq.away[i]) out.push({ side: 'away', i });
    }
    return out;
  }, [seq]);
  const [n, setN] = useState(0);              // 지금 차는 순서
  const [stage, setStage] = useState<'aim' | 'shot'>('aim');
  const done = n >= kicks.length;
  useEffect(() => {
    if (done) return;
    const t = setTimeout(() => { if (stage === 'aim') setStage('shot'); else { setStage('aim'); setN((x) => x + 1); } }, stage === 'aim' ? 1100 : 1000);
    return () => clearTimeout(t);
  }, [n, stage, done]);
  const shown = (side: Side, i: number) => kicks.findIndex((k) => k.side === side && k.i === i) < n || (stage === 'shot' && kicks[n]?.side === side && kicks[n]?.i === i);
  const score = (side: Side) => seq[side].filter((k, i) => k.scored && shown(side, i)).length;
  const cur = kicks[n];
  const curKick = cur ? seq[cur.side][cur.i] : null;
  const winner: Side = seq.score[0] > seq.score[1] ? 'home' : 'away';
  const club = (s: Side) => (s === 'home' ? home : away);
  const rounds = Math.max(5, seq.home.length, seq.away.length);

  return (
    <Shell onSkip={done ? undefined : () => setN(kicks.length)} skipLabel="결과 바로 보기">
      <div className="text-center text-[13px] font-semibold tracking-[0.3em] text-neon">승부차기</div>
      <div className="mt-4 flex items-center justify-center gap-5">
        <div className="flex w-36 flex-col items-center gap-1.5"><Crest clubId={home} size={48} /><span className="max-w-full truncate text-[13px] font-semibold">{clubKo(home)}</span></div>
        <div className="led tnum text-[52px] leading-none font-medium text-neon">{score('home')}<span className="mx-3 text-lo">:</span>{score('away')}</div>
        <div className="flex w-36 flex-col items-center gap-1.5"><Crest clubId={away} size={48} /><span className="max-w-full truncate text-[13px] font-semibold">{clubKo(away)}</span></div>
      </div>
      {/* 차기 기록 */}
      <div className="mx-auto mt-5 w-fit space-y-2">
        {(['home', 'away'] as Side[]).map((side) => (
          <div key={side} className="flex items-center gap-1.5">
            <span className="mr-1 w-6"><Crest clubId={club(side)} size={18} /></span>
            {Array.from({ length: rounds }, (_, i) => {
              const k = seq[side][i];
              const vis = k && shown(side, i);
              return <span key={i} className={`grid h-6 w-6 place-items-center rounded-full text-[12px] font-bold transition-all ${!vis ? 'bg-ink-800 ring-1 ring-line' : k.scored ? 'animate-[intro-pop_0.35s_ease-out] bg-neon text-ink-950' : 'animate-[intro-pop_0.35s_ease-out] bg-red text-hi'}`}>{vis ? (k.scored ? '○' : '✕') : ''}</span>;
            })}
          </div>
        ))}
      </div>
      {/* 지금 차는 선수 · 결과 */}
      <div className="mt-8 flex h-40 flex-col items-center justify-center">
        {!done && cur && curKick ? (
          <>
            <div className="flex items-center gap-2 text-[13px] text-mid"><Crest clubId={club(cur.side)} size={18} />{cur.i >= 5 ? '서든데스 · ' : `${cur.i + 1}번째 키커 · `}<span className="font-semibold text-hi">{playerKo(curKick.id, w.players[curKick.id]?.name ?? '')}</span></div>
            {stage === 'aim' ? (
              <div className="mt-5 flex flex-col items-center">
                <Ball className="h-12 w-12 animate-[bm-aim_1.1s_ease-in-out]" />
                <div className="mt-3 animate-[intro-glow_0.6s_ease-in-out_infinite] text-[15px] text-lo">준비…</div>
              </div>
            ) : curKick.scored ? (
              <div key={n} className="mt-4 animate-[bm-burst_0.5s_ease-out] text-[56px] leading-none font-black text-neon drop-shadow-[0_0_24px_rgb(57_255_20/0.6)]">골!</div>
            ) : (
              <div key={n} className="mt-4 animate-[intro-shake_0.35s_ease-in-out_2] text-[48px] leading-none font-black text-red">{curKick.saved ? '선방!' : '실축!'}</div>
            )}
          </>
        ) : (
          <div className="flex animate-[intro-pop_0.6s_ease-out] flex-col items-center">
            <Crest clubId={club(winner)} size={56} />
            <div className={`mt-3 text-[30px] font-black ${winner === mySide ? 'text-neon' : 'text-hi'}`}>{clubKo(club(winner))} 승리!</div>
            <div className="mt-1 text-[13px] text-lo">승부차기 {seq.score[0]} : {seq.score[1]}</div>
            <button onClick={onDone} className="mt-5 h-11 rounded-lg bg-neon px-8 text-[14px] font-semibold text-ink-950 hover:bg-[#5bff3d]">계속</button>
          </div>
        )}
      </div>
    </Shell>
  );
}

/** 우승 축하: 트로피 · 꽃가루 */
export function TrophyOverlay({ club, title, onDone }: { club: string; title: string; onDone: () => void }) {
  const bits = useMemo(() => Array.from({ length: 46 }, (_, i) => ({
    left: (i * 37) % 100, delay: (i % 12) * 0.18, dur: 2.4 + (i % 5) * 0.4, color: ['#39ff14', '#f2c94c', '#5ab0ff', '#ffffff', '#ff5a5a'][i % 5], r: (i * 47) % 360,
  })), []);
  return (
    <Shell>
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        {bits.map((b, i) => <span key={i} className="absolute -top-4 h-3 w-1.5 rounded-sm opacity-90" style={{ left: `${b.left}%`, background: b.color, transform: `rotate(${b.r}deg)`, animation: `bm-confetti ${b.dur}s linear ${b.delay}s infinite` }} />)}
      </div>
      <div className="relative text-center">
        <Trophy className="mx-auto h-28 w-28 animate-[bm-trophy_0.9s_cubic-bezier(.2,1.4,.4,1)] text-[#f2c94c] drop-shadow-[0_0_30px_rgb(242_201_76/0.55)]" />
        <div className="mt-4 animate-[intro-zoom_0.7s_ease-out] text-[13px] font-semibold tracking-[0.3em] text-[#f2c94c]">{title}</div>
        <div className="mt-2 animate-[intro-pop_0.8s_ease-out] text-[56px] leading-none font-black text-hi">우승!</div>
        <div className="mt-6 flex items-center justify-center gap-3"><Crest clubId={club} size={44} /><span className="text-[18px] font-semibold">{clubKo(club)}</span></div>
        <button onClick={onDone} className="mt-8 h-11 rounded-lg bg-neon px-10 text-[14px] font-semibold text-ink-950 hover:bg-[#5bff3d]">계속</button>
      </div>
    </Shell>
  );
}

function Trophy({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="currentColor" aria-hidden>
      <path d="M18 6h28v6h10v6c0 8-6 14-13 15-2 6-6 9-8 10v7h8v6H21v-6h8v-7c-2-1-6-4-8-10C14 32 8 26 8 18v-6h10V6Zm-4 12c0 4 3 8 6 9l-2-9h-4Zm32 0-2 9c3-1 6-5 6-9h-4Z" />
    </svg>
  );
}
function Ball({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <circle cx="24" cy="24" r="21" fill="#f4f4f2" />
      <path d="M24 14l7 5-3 8h-8l-3-8 7-5Z" fill="#141414" />
      <path d="M24 3v11M31 19l11-3M28 27l6 10M20 27l-6 10M17 19 6 16" stroke="#141414" strokeWidth="2" fill="none" />
    </svg>
  );
}
