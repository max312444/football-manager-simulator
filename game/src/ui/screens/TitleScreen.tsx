import { useMemo, useState } from 'react';
import { PitchArt } from '../components/PitchArt';
import { useApp } from '../../store/app';
import { useGame } from '../../store/game';
import { availableSeasons, leagues } from '../../data/db';

interface MenuItem { key: string; label: string; desc: string; disabled?: boolean; action?: () => void }

export function TitleScreen() {
  const go = useApp((s) => s.go);
  const hasWorld = useGame((s) => !!s.world);
  const [hover, setHover] = useState<string | null>(null);

  const dataStatus = useMemo(() =>
    leagues.filter((l) => l.level === 1 && l.tier === 'A')
      .map((l) => ({ ...l, seasons: availableSeasons(l.id) }))
      .filter((l) => l.seasons.length > 0),
  []);

  const items: MenuItem[] = [
    { key: 'new', label: '새 게임', desc: '시즌과 리그, 구단을 골라 감독 커리어를 시작합니다', action: () => go('newgame') },
    { key: 'continue', label: '이어하기', desc: hasWorld ? '진행 중인 게임으로 돌아갑니다' : '저장된 게임이 없습니다', disabled: !hasWorld, action: () => go('hub') },
    { key: 'load', label: '불러오기', desc: '저장 슬롯에서 게임을 불러옵니다', disabled: true },
    { key: 'db', label: '데이터베이스', desc: '수록된 리그·구단·선수를 둘러봅니다', disabled: true },
    { key: 'settings', label: '설정', desc: '언어, 화면, 진행 속도', disabled: true },
  ];

  return (
    <div className="relative flex h-full w-full overflow-hidden bg-ink-950">
      {/* 배경 */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-[72%] opacity-90">
        <PitchArt />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,var(--color-ink-950)_30%,transparent_70%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgb(0_0_0/0.65)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-ink-950 to-transparent" />

      {/* 왼쪽 메뉴 */}
      <div className="relative z-10 flex h-full w-full max-w-[560px] flex-col justify-between px-16 py-14">
        <header className="animate-[rise_0.8s_var(--ease-out-quart)_both]">
          <div className="flex items-center gap-3 text-[11px] font-semibold text-lo">
            <span className="h-px w-8 bg-neon" />
            축구 감독 시뮬레이션
          </div>
          <h1 className="mt-5 text-[64px] leading-[0.92] font-semibold tracking-[-0.03em] text-hi">
            PITCH<br />BOSS<span className="text-neon">.</span>
          </h1>
          <p className="mt-5 max-w-[400px] text-[15px] leading-relaxed text-mid">
            2000/01부터 지금까지, 실제 선수단으로 시작하는 감독 커리어.
          </p>
        </header>

        <nav className="my-10 flex flex-col" onMouseLeave={() => setHover(null)}>
          {items.map((it, i) => {
            const active = hover === it.key && !it.disabled;
            return (
              <button
                key={it.key}
                disabled={it.disabled}
                onMouseEnter={() => setHover(it.key)}
                onClick={it.action}
                style={{ animationDelay: `${120 + i * 60}ms` }}
                className="group relative flex animate-[rise_0.7s_var(--ease-out-quart)_both] items-baseline gap-5 py-3 text-left outline-none disabled:cursor-default"
              >
                <span
                  className={`absolute top-1/2 -left-6 h-6 w-0.5 -translate-y-1/2 rounded-full bg-neon transition-colors duration-300 ${active ? 'opacity-100' : 'opacity-0'}`}
                />
                <span className={`tnum w-6 text-[12px] font-medium transition-colors ${active ? 'text-neon' : 'text-lo'}`}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="flex flex-col">
                  <span
                    className={`text-[26px] font-semibold transition-colors duration-300 ${
                      it.disabled ? 'text-[#3b433e]' : active ? 'translate-x-1 text-hi' : 'text-mid group-focus-visible:text-hi'
                    }`}
                  >
                    {it.label}
                  </span>
                  <span
                    className={`overflow-hidden text-[13px] text-mid transition-colors duration-300 ${active ? 'mt-1 max-h-6 opacity-100' : 'max-h-0 opacity-0'}`}
                  >
                    {it.desc}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        <footer className="flex items-end justify-between text-[12px] text-lo">
          <div className="space-y-2">
            <div className="text-[11px] font-semibold text-lo">수록 데이터</div>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {dataStatus.map((l) => (
                <div key={l.id} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-neon/80" />
                  <span className="text-mid">{l.ko}</span>
                  <span className="tnum">{l.seasons.length}시즌</span>
                </div>
              ))}
            </div>
          </div>
          <div className="tnum">v0.0.1 · M0</div>
        </footer>
      </div>
    </div>
  );
}
