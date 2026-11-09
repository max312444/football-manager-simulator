import { GlobalSearch } from './GlobalSearch';
import { koDate } from '../format';
import { useWorld } from '../hooks';

export function TopBar({ title, subtitle }: { title: string; subtitle?: string }) {
  const w = useWorld();
  return (
    <header className="flex h-16 shrink-0 items-center gap-6 border-b border-line bg-ink-900/80 px-6 backdrop-blur">
      <div className="min-w-0">
        <div className="text-[17px] leading-tight font-semibold">{title}</div>
        {subtitle && <div className="text-[12px] text-lo">{subtitle}</div>}
      </div>
      <GlobalSearch />
      <div className="tnum text-[13px] font-semibold text-mid">{koDate(w.date)}</div>
    </header>
  );
}
