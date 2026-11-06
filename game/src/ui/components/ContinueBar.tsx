// 하단 진행 바: 다음 일정 정보 + "계속" 버튼 (스페이스 키로도 진행)
import { useEffect } from 'react';
import { Icon } from './Icon';
import { Crest } from './Crest';
import { koDate } from '../format';
import { useWorld } from '../hooks';
import { useGame } from '../../store/game';
import { nextUserFixture, seasonOver } from '../../engine/world';
import { clubKo } from '../../data/db';

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

export function ContinueBar() {
  const w = useWorld();
  const continueGame = useGame((s) => s.continueGame);
  const next = nextUserFixture(w);
  const over = seasonOver(w);
  const today = next?.date === w.date;
  const home = next?.home === w.userClubId;
  const opp = next ? (home ? next.away : next.home) : null;
  const dday = next ? daysBetween(w.date, next.date) : 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || over) return;
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
      e.preventDefault();
      continueGame();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [continueGame, over]);

  return (
    <footer className="flex h-[72px] shrink-0 items-center gap-6 border-t border-line bg-ink-900/90 px-6 backdrop-blur">
      {over ? (
        <div className="text-[14px] font-semibold text-mid">시즌이 끝났습니다 — 다음 시즌 진행은 곧 추가됩니다</div>
      ) : next && opp ? (
        <div className="flex min-w-0 items-center gap-4">
          <div className={`grid h-11 w-14 shrink-0 place-items-center rounded-[5px] ${today ? 'bg-neon/15 text-neon' : 'bg-ink-800 text-mid'}`}>
            <div className="text-center leading-tight">
              <div className="text-[10px] font-semibold tracking-[0.1em]">{today ? 'TODAY' : 'D-DAY'}</div>
              <div className="tnum text-[15px] font-black">{today ? '경기' : `-${dday}`}</div>
            </div>
          </div>
          <Crest clubId={opp} size={28} />
          <div className="min-w-0">
            <div className="truncate text-[14px] font-bold">
              {clubKo(opp)} <span className="font-medium text-lo">{home ? '(홈)' : '(원정)'}</span>
            </div>
            <div className="tnum text-[12px] text-lo">{koDate(next.date)} · {next.round}라운드</div>
          </div>
        </div>
      ) : <div />}

      <div className="ml-auto flex items-center gap-4">
        <span className="hidden text-[12px] text-lo lg:inline">
          <kbd className="rounded-[3px] border border-line-strong px-1.5 py-0.5 text-[11px] text-mid">Space</kbd> 로도 진행
        </span>
        <button onClick={continueGame} disabled={over}
          className="group flex h-12 min-w-[200px] items-center justify-center gap-2.5 rounded-[6px] bg-neon px-8 text-[15px] font-bold text-ink-950 shadow-[0_0_0_1px_rgb(57_255_20/0.45),0_10px_32px_-10px_rgb(57_255_20/0.7)] transition-all hover:bg-[#5bff3d] hover:shadow-[0_0_0_1px_rgb(57_255_20/0.6),0_12px_40px_-8px_rgb(57_255_20/0.85)] active:translate-y-px disabled:bg-ink-700 disabled:text-lo disabled:shadow-none">
          {today ? '경기 준비' : '계속'}
          <Icon name="arrow" size={18} className="transition-transform group-hover:translate-x-1" />
        </button>
      </div>
    </footer>
  );
}
