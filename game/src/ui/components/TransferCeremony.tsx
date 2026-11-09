// 이적 확정 연출: ① 계약서에 서명 → ② 두 구단의 악수 → ③ 공식 발표
// 사진 대신 SVG + CSS 애니메이션 (외부 이미지 없음)
import { useEffect, useState } from 'react';
import { clubs, clubKo, playerKo } from '../../data/db';
import { Crest } from './Crest';
import { money } from '../format';

export interface Ceremony {
  player: string;
  playerName: string;
  from: string | null;
  to: string;
  fee: number;
  wage: number;
  years: number;
  /** in: 내가 영입 · out: 내 선수 판매 */
  kind: 'in' | 'out';
}

const SIGN = 'M10 52 C 28 18, 40 70, 58 40 S 86 20, 96 46 S 120 66, 134 34 C 142 20, 150 48, 166 42 S 190 30, 214 40';
const colorOf = (id: string | null, fallback: string) => (id ? clubs.get(id)?.crest?.colors[0] ?? clubs.get(id)?.kits?.home.primary ?? fallback : fallback);

export function TransferCeremony({ c, onClose }: { c: Ceremony; onClose: () => void }) {
  const [phase, setPhase] = useState<0 | 1 | 2>(0);
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 2100);
    const t2 = setTimeout(() => setPhase(2), 3500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') { e.preventDefault(); phase === 2 ? onClose() : setPhase(2); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, onClose]);

  const left = c.from, right = c.to;
  const leftColor = colorOf(left, '#5c6660'), rightColor = colorOf(right, '#39ff14');
  const name = playerKo(c.player, c.playerName);
  const headline = c.kind === 'in' ? `${clubKo(c.to)} 입단` : `${clubKo(c.to)}로 이적`;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-ink-950/90 backdrop-blur-sm" onClick={() => (phase === 2 ? onClose() : setPhase(2))}>
      <style>{`
        @keyframes tc-up { from { opacity: 0; transform: translateY(24px) scale(.96) } to { opacity: 1; transform: none } }
        @keyframes tc-draw { from { stroke-dashoffset: 420 } to { stroke-dashoffset: 0 } }
        @keyframes tc-pen { from { offset-distance: 0% } to { offset-distance: 100% } }
        @keyframes tc-left { from { transform: translateX(-140px) rotate(-6deg); opacity: 0 } 70% { transform: translateX(6px) rotate(1deg); opacity: 1 } to { transform: none } }
        @keyframes tc-right { from { transform: translateX(140px) rotate(6deg); opacity: 0 } 70% { transform: translateX(-6px) rotate(-1deg); opacity: 1 } to { transform: none } }
        @keyframes tc-shake { 0%,100% { transform: translateY(0) } 30% { transform: translateY(-5px) } 60% { transform: translateY(4px) } }
        @keyframes tc-ring { from { transform: scale(.6); opacity: .7 } to { transform: scale(1.8); opacity: 0 } }
        @keyframes tc-fall { from { transform: translateY(-20px) rotate(0); opacity: 1 } to { transform: translateY(420px) rotate(540deg); opacity: 0 } }
      `}</style>

      <div className="relative w-[620px] max-w-[92vw]" onClick={(e) => e.stopPropagation()}>
        {/* ① 서명 */}
        {phase === 0 && (
          <div className="panel mx-auto w-[460px] px-10 pt-9 pb-8" style={{ animation: 'tc-up .5s var(--ease-out-quart) both' }}>
            <div className="flex items-center justify-between text-[12px] text-lo"><span>선수 계약서</span><Crest clubId={c.to} size={22} /></div>
            <div className="mt-4 text-[20px] font-semibold">{name}</div>
            <div className="mt-1 text-[13px] text-mid">{clubKo(c.to)} · {c.years}년 계약 · 주급 {money(c.wage)}</div>
            <div className="mt-6 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-1.5 rounded-full bg-ink-700" style={{ width: `${90 - i * 18}%` }} />)}</div>
            <div className="relative mt-8 h-20">
              <svg viewBox="0 0 224 80" className="absolute inset-0 h-full w-full">
                <path d={SIGN} fill="none" stroke="#e9eeea" strokeWidth={2.4} strokeLinecap="round" strokeDasharray={420}
                  style={{ animation: 'tc-draw 1.5s .35s ease-in-out both' }} />
              </svg>
              {/* 펜: 서명 선을 따라 움직임 */}
              <svg width="26" height="26" viewBox="0 0 24 24" className="absolute top-0 left-0"
                style={{ offsetPath: `path('${SIGN}')`, offsetRotate: '0deg', animation: 'tc-pen 1.5s .35s ease-in-out both', transformOrigin: '0 100%', transform: 'translate(-2px,-22px)' }}>
                <path d="M3 21 L6 14 L17 3 L21 7 L10 18 Z" fill="#39ff14" /><path d="M3 21 L6 14 L10 18 Z" fill="#e9eeea" />
              </svg>
            </div>
            <div className="border-t border-line-strong pt-2 text-[11px] text-lo">서명</div>
          </div>
        )}

        {/* ② 악수 */}
        {phase === 1 && (
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-10">
              {left ? <Crest clubId={left} size={56} /> : <div className="grid h-16 w-14 place-items-center rounded-lg border border-line text-[12px] text-lo">FA</div>}
              <div className="relative h-[150px] w-[300px]">
                <span className="absolute top-1/2 left-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-neon/60" style={{ animation: 'tc-ring .9s .55s ease-out both' }} />
                <svg viewBox="0 0 300 150" className="absolute inset-0" style={{ animation: 'tc-shake .5s .6s ease-in-out 2' }}>
                  <g style={{ animation: 'tc-left .6s var(--ease-out-quart) both' }}>
                    <rect x="0" y="62" width="112" height="34" rx="6" fill={leftColor} />
                    <rect x="104" y="60" width="12" height="38" rx="3" fill="#f4f4f2" opacity=".9" />
                    <path d="M116 64 C 132 58, 150 58, 164 66 L 168 76 C 160 80, 150 80, 142 78 L 150 92 C 138 98, 124 96, 116 92 Z" fill="#d9a77e" />
                  </g>
                  <g style={{ animation: 'tc-right .6s var(--ease-out-quart) both' }}>
                    <rect x="188" y="62" width="112" height="34" rx="6" fill={rightColor} />
                    <rect x="184" y="60" width="12" height="38" rx="3" fill="#f4f4f2" opacity=".9" />
                    <path d="M184 64 C 168 60, 152 64, 140 72 L 146 82 C 154 86, 166 88, 178 84 L 184 92 Z" fill="#c8946a" />
                    <path d="M150 72 L 176 70 M148 78 L 174 77 M150 84 L 172 84" stroke="#a87652" strokeWidth="1.6" strokeLinecap="round" />
                  </g>
                </svg>
              </div>
              <Crest clubId={right} size={56} />
            </div>
            <div className="mt-6 text-[15px] text-mid" style={{ animation: 'tc-up .5s .4s both' }}>{left ? `${clubKo(left)} ↔ ${clubKo(right)}` : `자유계약 → ${clubKo(right)}`} 합의 완료</div>
          </div>
        )}

        {/* ③ 공식 발표 */}
        {phase === 2 && (
          <div className="panel relative overflow-hidden px-10 py-10 text-center" style={{ animation: 'tc-up .5s var(--ease-out-quart) both' }}>
            {/* 색종이: 두 구단 색 + 네온 */}
            <div className="pointer-events-none absolute inset-0">
              {Array.from({ length: 22 }, (_, i) => (
                <span key={i} className="absolute top-0 h-2.5 w-1.5 rounded-sm"
                  style={{ left: `${(i * 37) % 100}%`, background: [leftColor, rightColor, '#39ff14'][i % 3], animation: `tc-fall ${1.6 + (i % 5) * 0.25}s ${(i % 7) * 0.08}s ease-in both` }} />
              ))}
            </div>
            <div className="relative">
              <div className="text-[12px] font-medium text-neon">공식 발표</div>
              <div className="mt-4 flex items-center justify-center gap-5">
                {left && <><Crest clubId={left} size={40} /><span className="text-[20px] text-lo">→</span></>}
                <Crest clubId={right} size={64} />
              </div>
              <div className="mt-5 text-[30px] font-semibold">{name}</div>
              <div className="mt-1 text-[16px] text-mid">{headline}</div>
              <div className="mx-auto mt-6 grid max-w-[420px] grid-cols-3 gap-px overflow-hidden rounded-lg bg-line text-[13px]">
                {([['이적료', c.fee > 0 ? money(c.fee) : '자유계약'], ['주급', money(c.wage)], ['계약', `${c.years}년`]] as const).map(([k, v]) => (
                  <div key={k} className="bg-ink-850 px-3 py-3"><div className="text-[11px] text-lo">{k}</div><div className="tnum mt-1 font-semibold">{v}</div></div>
                ))}
              </div>
              <button onClick={onClose} className="mt-8 h-11 rounded-lg bg-neon px-8 text-[14px] font-semibold text-ink-950 transition-colors hover:bg-[#5bff3d]">확인</button>
            </div>
          </div>
        )}
        {phase < 2 && <div className="mt-6 text-center text-[12px] text-lo">눌러서 건너뛰기</div>}
      </div>
    </div>
  );
}
