// 시즌 말 내 구단 수상 연출: 리그 우승(트로피 · 색종이) → 개인 수상(메달 · 선수 카드)
// 이미지 파일 없이 SVG + CSS. Space · Enter 로 다음
import { useEffect, useState } from 'react';
import { useGame } from '../../store/game';
import { useWorld } from '../hooks';
import { clubs, clubKo, compKo, playerKo } from '../../data/db';
import { AWARD_KO, isTrophy, type Award } from '../../engine/awards';
import { Crest } from './Crest';
import { PosTag } from './bits';

const colorOf = (id: string) => clubs.get(id)?.crest?.colors[0] ?? clubs.get(id)?.kits?.home.primary ?? '#39ff14';

export function AwardCeremony() {
  const list = useGame((s) => s.awards);
  const close = useGame((s) => s.closeAwards);
  const hasNews = useGame((s) => !!s.news?.length);
  const [i, setI] = useState(0);
  const next = () => (list && i < list.length - 1 ? setI(i + 1) : (setI(0), close()));
  useEffect(() => {
    if (!list) return;
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); next(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  if (!list?.length) return null;
  const a = list[Math.min(i, list.length - 1)];
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-ink-950/90 backdrop-blur-sm" onClick={next}>
      <style>{`
        @keyframes ac-rise { from { opacity: 0; transform: translateY(40px) scale(.9) } to { opacity: 1; transform: none } }
        @keyframes ac-glow { 0%,100% { opacity: .35 } 50% { opacity: .8 } }
        @keyframes ac-fall { from { transform: translateY(-30px) rotate(0); opacity: 1 } to { transform: translateY(560px) rotate(620deg); opacity: 0 } }
        @keyframes ac-pop { from { opacity: 0; transform: scale(.4) rotate(-20deg) } 70% { opacity: 1; transform: scale(1.08) rotate(4deg) } to { opacity: 1; transform: none } }
        @keyframes ac-shine { from { transform: translateX(-120%) skewX(-20deg) } to { transform: translateX(220%) skewX(-20deg) } }
      `}</style>
      <div key={i} className="relative w-[600px] max-w-[92vw]" onClick={(e) => e.stopPropagation()}>
        {isTrophy(a.kind) ? <Champion a={a} /> : <Individual a={a} />}
        <div className="mt-6 flex items-center justify-between">
          <span className="tnum text-[12px] text-lo">{i + 1} / {list.length}</span>
          <button onClick={next} className="h-11 rounded-lg bg-neon px-8 text-[14px] font-semibold text-ink-950 transition-colors hover:bg-[#5bff3d]">
            {i < list.length - 1 ? '다음' : hasNews ? '시즌 소식 보기' : '시즌 결산 보기'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Confetti({ colors }: { colors: string[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 34 }, (_, k) => (
        <span key={k} className="absolute top-0 h-3 w-1.5 rounded-sm"
          style={{ left: `${(k * 29) % 100}%`, background: colors[k % colors.length], animation: `ac-fall ${1.8 + (k % 6) * 0.3}s ${(k % 9) * 0.12}s ease-in both` }} />
      ))}
    </div>
  );
}

function Rewards({ a }: { a: Award }) {
  return (
    <ul className="mx-auto mt-6 flex max-w-[440px] flex-wrap justify-center gap-2 text-[12px]" style={{ animation: 'ac-rise .5s .9s both' }}>
      {a.rewards.map((r) => <li key={r} className="rounded-md bg-ink-800 px-2.5 py-1 text-mid">{r}</li>)}
    </ul>
  );
}

function Champion({ a }: { a: Award }) {
  const lg = compKo(a.league) ?? a.league;
  const c = colorOf(a.club);
  return (
    <div className="panel relative overflow-hidden px-10 pt-10 pb-9 text-center">
      <Confetti colors={[c, '#39ff14', '#f2c94c', '#e9eeea']} />
      <div className="absolute top-8 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full blur-3xl" style={{ background: '#f2c94c', animation: 'ac-glow 2.4s ease-in-out infinite' }} />
      <div className="relative">
        <div className="text-[12px] font-semibold text-neon">{a.season.replace('-', '/')} · {lg}</div>
        {/* 트로피 */}
        <svg viewBox="0 0 120 140" className="mx-auto mt-4 h-[150px]" style={{ animation: 'ac-rise .7s var(--ease-out-quart) both' }}>
          <defs>
            <linearGradient id="gold" x1="0" x2="1"><stop offset="0" stopColor="#b8860b" /><stop offset=".45" stopColor="#ffe08a" /><stop offset="1" stopColor="#c9971c" /></linearGradient>
          </defs>
          <path d="M30 14 H90 V44 C90 66 76 80 60 80 C44 80 30 66 30 44 Z" fill="url(#gold)" />
          <path d="M30 22 H14 C14 44 24 54 34 56 M90 22 H106 C106 44 96 54 86 56" fill="none" stroke="url(#gold)" strokeWidth="6" strokeLinecap="round" />
          <rect x="53" y="80" width="14" height="22" fill="url(#gold)" />
          <path d="M36 102 H84 L88 118 H32 Z" fill="url(#gold)" />
          <rect x="26" y="118" width="68" height="12" rx="2" fill="#2a2f2b" />
          <rect x="44" y="121" width="32" height="6" rx="1" fill={c} />
        </svg>
        <div className="mt-2 flex items-center justify-center gap-3" style={{ animation: 'ac-rise .5s .45s both' }}>
          <Crest clubId={a.club} size={40} />
          <div className="text-[30px] font-semibold">{clubKo(a.club)}</div>
        </div>
        <div className="mt-1 text-[18px] font-semibold text-[#f2c94c]" style={{ animation: 'ac-rise .5s .6s both' }}>{AWARD_KO[a.kind]}</div>
        <div className="tnum mt-1 text-[13px] text-mid" style={{ animation: 'ac-rise .5s .7s both' }}>{a.value}</div>
        <Rewards a={a} />
      </div>
    </div>
  );
}

function Individual({ a }: { a: Award }) {
  const w = useWorld();
  const p = w.players[a.player!];
  const lg = compKo(a.league) ?? a.league;
  const c = colorOf(a.club);
  return (
    <div className="panel relative overflow-hidden px-10 pt-9 pb-9 text-center">
      <Confetti colors={[c, '#39ff14', '#e9eeea']} />
      <div className="relative">
        <div className="text-[12px] font-semibold text-neon">{a.season.replace('-', '/')} · {lg}</div>
        {/* 메달 */}
        <div className="relative mx-auto mt-5 h-[120px] w-[120px]" style={{ animation: 'ac-pop .7s var(--ease-out-quart) both' }}>
          <svg viewBox="0 0 120 120" width="120" height="120" className="absolute top-0 left-0">
            <path d="M42 0 L60 34 L78 0" fill={c} opacity=".9" />
            <circle cx="60" cy="72" r="44" fill="#d4a72c" />
            <circle cx="60" cy="72" r="36" fill="none" stroke="#ffe08a" strokeWidth="2" />
            <path d="M60 50 L66 65 L82 66 L70 76 L74 92 L60 83 L46 92 L50 76 L38 66 L54 65 Z" fill="#fff4cc" />
          </svg>
          <div className="absolute top-[28px] left-[16px] h-[88px] w-[88px] overflow-hidden rounded-full"><span className="absolute inset-y-0 w-6 bg-white/25" style={{ animation: 'ac-shine 1.4s .8s ease-out both' }} /></div>
        </div>
        <div className="mt-4 text-[18px] font-semibold text-[#f2c94c]" style={{ animation: 'ac-rise .5s .35s both' }}>{AWARD_KO[a.kind]}</div>
        <div className="mt-3 text-[30px] font-semibold" style={{ animation: 'ac-rise .5s .5s both' }}>{playerKo(p.id, p.name)}</div>
        <div className="mt-2 flex items-center justify-center gap-2 text-[13px] text-mid" style={{ animation: 'ac-rise .5s .6s both' }}>
          <PosTag pos={p.pos} /><Crest clubId={a.club} size={18} />{clubKo(a.club)} · <span className="tnum">{a.value}</span>
        </div>
        <Rewards a={a} />
      </div>
    </div>
  );
}
