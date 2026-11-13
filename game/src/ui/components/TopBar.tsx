import { GlobalSearch } from './GlobalSearch';
import { useApp } from '../../store/app';
import { koDate } from '../format';
import { useWorld } from '../hooks';

export function TopBar({ title, subtitle }: { title: string; subtitle?: string }) {
  const w = useWorld();
  const setDrawer = useApp((s) => s.setDrawer);
  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-ink-900/80 px-3 pt-[env(safe-area-inset-top)] backdrop-blur box-content lg:h-16 lg:gap-6 lg:px-6">
      <button data-tour="menu" onClick={() => setDrawer(true)} aria-label="메뉴" className="-ml-1 grid h-10 w-10 shrink-0 place-items-center rounded-lg text-mid hover:bg-ink-800 hover:text-hi lg:hidden">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
      </button>
      <div className="min-w-0 shrink-0">
        <div className="text-[16px] leading-tight font-semibold lg:text-[17px]">{title}</div>
        {subtitle && <div className="hidden text-[12px] text-lo sm:block">{subtitle}</div>}
      </div>
      <GlobalSearch />
      <div className="tnum shrink-0 text-[12px] font-semibold text-mid lg:text-[13px]"><span className="lg:hidden">{w.date.slice(5).replace('-', '.')}</span><span className="hidden lg:inline">{koDate(w.date)}</span></div>
    </header>
  );
}
