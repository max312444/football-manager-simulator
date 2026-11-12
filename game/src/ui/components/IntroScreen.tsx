// 첫 화면 인트로: "내가 해도 저것보다 잘하겠다"에서 시작된 감독 시뮬레이션
//  브라우저를 켜고 처음 들어오면 한 번 (sessionStorage), 첫 화면 오른쪽 아래 '인트로 다시 보기'로 다시 볼 수 있다
//  장면은 시간이 지나면 넘어가고, 누르거나 Space · Enter 로 다음, Esc · 건너뛰기로 끝
import { useCallback, useEffect, useState, type CSSProperties } from 'react';

const KEY = 'pitchboss.intro';
export const introSeen = () => { try { return sessionStorage.getItem(KEY) === '1'; } catch { return true; } };
const markSeen = () => { try { sessionStorage.setItem(KEY, '1'); } catch { /* 무시 */ } };

/** 장면별 시간 (ms). 마지막 장면은 직접 닫을 때까지 */
const DUR = [3800, 3600, 2800, 3000, 4600, 0];

const css = (o: Record<string, string | number>) => o as CSSProperties;
const anim = (name: string, ms: number, delay = 0, fill = 'both') => ({ animation: `${name} ${ms}ms var(--ease-out-quart) ${delay}ms ${fill}` });

/** 1. 관중석: 불만이 터져 나오는 말풍선 */
function Crowd() {
  return (
    <div className="relative flex min-h-full w-full items-center justify-center py-16">
      {/* 관중석 점 */}
      <div className="absolute inset-x-0 bottom-0 h-[55%] opacity-50" style={{ backgroundImage: 'radial-gradient(circle, rgb(233 238 234 / 0.18) 1.4px, transparent 1.6px)', backgroundSize: '14px 12px', maskImage: 'linear-gradient(to top, black 20%, transparent)' }} />
      <div className="absolute top-[18%] left-1/2 h-[340px] w-[min(700px,100vw)] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,rgb(57_255_20/0.10),transparent_70%)]" style={{ animation: 'intro-glow 2.4s ease-in-out infinite' }} />
      <div className="relative flex w-full max-w-[860px] flex-col gap-6 px-5 sm:gap-8 sm:px-8">
        <div className="self-start rounded-2xl rounded-bl-sm bg-ink-800 px-5 py-3.5 text-[19px] font-semibold text-hi sm:px-6 sm:py-4 sm:text-[26px] ring-1 ring-line-strong" style={anim('intro-pop', 600, 250)}>
          "아오, 진짜 못하네… <span className="text-red">감독 경질해라!</span>"
        </div>
        <div className="self-end rounded-2xl rounded-br-sm bg-neon px-5 py-3.5 text-[21px] font-bold text-ink-950 sm:px-6 sm:py-4 sm:text-[30px]" style={{ ...anim('intro-pop', 600, 1500), }}>
          <span className="inline-block" style={{ animation: 'intro-shake 0.25s linear 2200ms 3' }}>"내가 해도 저거보다 잘하겠네!!!"</span>
        </div>
        <div className="self-center text-[14px] text-lo" style={anim('fade', 700, 2600)}>축구를 좋아한다면, 한 번쯤 이런 적 있지 않나요?</div>
      </div>
    </div>
  );
}

/** 2. 불만이 쌓이고 쌓여서 */
function Stack() {
  const cards = [['이해할 수 없는 교체', -6], ['왜 저 선수를 사?', 4], ['또 똑같은 전술…', -3], ['선발 명단 실화?', 7], ['이적시장 빈손', -8]] as const;
  return (
    <div className="flex min-h-full w-full flex-col items-center justify-center py-16 gap-10 px-8">
      <div className="text-center text-[22px] leading-snug font-semibold sm:text-[30px]" style={anim('rise', 700, 100)}>
        감독의 전술, 이적, 교체…<br /><span className="text-neon">불만이 쌓이고 쌓여서</span>
      </div>
      <div className="relative h-[230px] w-[min(340px,86vw)]">
        {cards.map(([t, r], i) => (
          <div key={t} className="absolute left-1/2 w-[260px] -translate-x-1/2 rounded-xl bg-ink-800 px-5 py-3.5 text-center text-[17px] font-semibold text-mid shadow-[0_12px_30px_rgb(0_0_0/0.45)] ring-1 ring-line-strong"
            style={{ bottom: i * 40, ...css({ '--r': `${r}deg` }), ...anim('intro-drop', 650, 500 + i * 420) }}>
            {t}
          </div>
        ))}
      </div>
    </div>
  );
}

/** 3. 그래서 */
function Decide() {
  return (
    <div className="flex min-h-full w-full flex-col items-center justify-center py-16 gap-4 px-8 text-center">
      <div className="text-[22px] text-mid" style={anim('rise', 600, 100)}>그래서,</div>
      <div className="text-[28px] leading-tight font-bold sm:text-[40px]" style={anim('intro-zoom', 900, 700)}>진짜로 <span className="text-neon">감독</span>이 되어 보기로 했다.</div>
    </div>
  );
}

/** 4. 2000/01 ~ 2025/26 */
function Years() {
  const [y, setY] = useState(2000);
  useEffect(() => { const t = setInterval(() => setY((v) => (v < 2025 ? v + 1 : v)), 70); return () => clearInterval(t); }, []);
  return (
    <div className="flex min-h-full w-full flex-col items-center justify-center py-16 gap-5 px-8 text-center">
      <div className="led text-[60px] leading-none font-semibold text-neon sm:text-[84px]">{y}/{String((y + 1) % 100).padStart(2, '0')}</div>
      <div className="h-1 w-[min(420px,80vw)] origin-left rounded-full bg-neon/60" style={anim('intro-bar', 1900, 0)} />
      <div className="text-[16px] text-mid sm:text-[20px]" style={anim('rise', 600, 600)}>2000/01부터 2025/26까지, <span className="text-hi">실제 선수단</span>으로</div>
    </div>
  );
}

/** 5. 원하는 팀 · 꿈의 스쿼드 (4-3-3 이 자리 잡는다) */
function Squad() {
  const spots: [number, number][] = [[50, 90], [18, 70], [39, 74], [61, 74], [82, 70], [30, 50], [50, 54], [70, 50], [22, 26], [50, 20], [78, 26]];
  return (
    <div className="flex min-h-full w-full flex-col items-center justify-center gap-6 px-6 py-16 sm:flex-row sm:gap-14 sm:px-10">
      <div className="relative h-[240px] w-[180px] shrink-0 sm:h-[360px] sm:w-[260px] overflow-hidden rounded-xl border border-neon/30 bg-[linear-gradient(180deg,#0f2a14,#0b1e0e)]" style={anim('fade', 600, 0)}>
        <div className="absolute inset-x-0 top-1/2 h-px bg-neon/25" />
        <div className="absolute top-1/2 left-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-neon/25" />
        <div className="absolute bottom-0 left-1/2 h-12 w-28 -translate-x-1/2 border border-b-0 border-neon/25" />
        <div className="absolute top-0 left-1/2 h-12 w-28 -translate-x-1/2 border border-t-0 border-neon/25" />
        {spots.map(([x, yy], i) => (
          <span key={i} className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neon shadow-[0_0_14px_rgb(57_255_20/0.7)]"
            style={{ left: `${x}%`, top: `${yy}%`, ...css({ '--fx': `${(50 - x) * 1.6}px`, '--fy': `${(100 - yy) * 1.2}px` }), ...anim('intro-place', 600, 1500 + i * 130) }} />
        ))}
      </div>
      <div className="flex max-w-[420px] flex-col gap-4 text-center sm:gap-6 sm:text-left">
        <div className="text-[22px] leading-snug font-semibold sm:text-[30px]" style={anim('rise', 700, 150)}>원하는 팀의 감독이 되어,<br /><span className="text-neon">우승을 향해</span></div>
        <div className="text-[22px] leading-snug font-semibold sm:text-[30px]" style={anim('rise', 700, 1700)}>원하는 선수를 영입해,<br />당신만의 <span className="text-neon">꿈의 스쿼드</span>를</div>
      </div>
    </div>
  );
}

/** 6. 로고 */
function Logo({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex min-h-full w-full flex-col items-center justify-center py-16 gap-6 px-8 text-center">
      <div className="text-[13px] font-semibold text-lo" style={anim('fade', 600, 200)}>"내가 해도 저것보단 잘하겠다"에서 시작된 감독 시뮬레이션</div>
      <h1 className="text-[52px] leading-[0.9] font-semibold tracking-[-0.03em] sm:text-[96px]" style={anim('intro-zoom', 1000, 400)}>PITCH BOSS<span className="text-neon">.</span></h1>
      <button onClick={onStart} className="mt-4 h-12 rounded-lg bg-neon px-10 text-[16px] font-semibold text-ink-950 transition-colors hover:bg-[#5bff3d]" style={anim('rise', 600, 1200)}>시작하기</button>
    </div>
  );
}

export function IntroScreen({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const last = DUR.length - 1;
  const close = useCallback(() => { markSeen(); onClose(); }, [onClose]);
  const next = useCallback(() => setI((v) => Math.min(last, v + 1)), [last]);
  useEffect(() => { markSeen(); }, []);
  useEffect(() => {
    if (!DUR[i]) return;
    const t = setTimeout(next, DUR[i]);
    return () => clearTimeout(t);
  }, [i, next]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (i === last) close(); else next(); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [i, last, next, close]);

  const scenes = [<Crowd />, <Stack />, <Decide />, <Years />, <Squad />, <Logo onStart={close} />];
  return (
    <div className="fixed inset-0 z-[95] overflow-hidden bg-ink-950 select-none" onClick={() => (i === last ? null : next())}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgb(0_0_0/0.7)_100%)]" />
      <div key={i} className="absolute inset-0 overflow-y-auto" style={anim('fade', 500)}>{scenes[i]}</div>
      <button onClick={(e) => { e.stopPropagation(); close(); }} className="absolute top-[max(16px,env(safe-area-inset-top))] right-4 z-10 rounded-lg sm:top-6 sm:right-8 px-3 py-1.5 text-[13px] text-lo ring-1 ring-line transition-colors hover:text-hi">건너뛰기</button>
      {/* 장면 진행 표시 */}
      <div className="absolute bottom-[max(20px,env(safe-area-inset-bottom))] left-1/2 z-10 sm:bottom-8 flex -translate-x-1/2 gap-2">
        {DUR.map((_, k) => <span key={k} className={`h-1 rounded-full transition-all duration-300 ${k === i ? 'w-8 bg-neon' : k < i ? 'w-3 bg-neon/50' : 'w-3 bg-ink-700'}`} />)}
      </div>
    </div>
  );
}
