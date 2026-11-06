import { Icon } from './Icon';
import { koDate } from '../format';
import { useWorld } from '../hooks';
import { useGame } from '../../store/game';
import { nextUserFixture, seasonOver } from '../../engine/world';
import { clubKo } from '../../data/db';

export function TopBar({ title, subtitle }: { title: string; subtitle?: string }) {
  const w = useWorld();
  const continueGame = useGame((s) => s.continueGame);
  const next = nextUserFixture(w);
  const over = seasonOver(w);
  const note = over ? '시즌 종료'
    : next ? (next.date === w.date ? `오늘 경기 · ${clubKo(next.home === w.userClubId ? next.away : next.home)}` : `다음 경기 · ${koDate(next.date).replace(/^\d+년 /, '')}`)
    : '';

  return (
    <header className="flex h-[60px] shrink-0 items-center gap-6 border-b border-line bg-ink-900/80 px-6 backdrop-blur">
      <div className="min-w-0">
        <div className="text-[17px] leading-tight font-bold tracking-[-0.02em]">{title}</div>
        {subtitle && <div className="text-[12px] text-lo">{subtitle}</div>}
      </div>

      <div className="mx-auto flex h-9 w-full max-w-[360px] items-center gap-2 rounded-[5px] border border-line bg-ink-850 px-3 text-[13px] text-lo">
        <Icon name="search" size={15} />
        <span>선수, 구단, 리그 검색</span>
      </div>

      <div className="flex items-center gap-5">
        <div className="text-right">
          <div className="tnum text-[13px] font-semibold">{koDate(w.date)}</div>
          <div className="text-[12px] text-lo">{note}</div>
        </div>
        <button onClick={continueGame} disabled={over}
          className="group flex h-10 items-center gap-2 rounded-[5px] bg-neon pr-4 pl-5 text-[14px] font-bold text-ink-950 shadow-[0_0_0_1px_rgb(57_255_20/0.4),0_6px_24px_-6px_rgb(57_255_20/0.55)] transition-all hover:bg-[#5bff3d] active:translate-y-px disabled:bg-ink-700 disabled:text-lo disabled:shadow-none">
          {next && next.date === w.date ? '경기 준비' : '계속'}
          <Icon name="arrow" size={17} className="transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </header>
  );
}
