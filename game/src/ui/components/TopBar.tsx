import { Icon } from './Icon';
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
      <div className="mx-auto flex h-9 w-full max-w-[360px] items-center gap-2 rounded-lg border border-line bg-ink-850 px-3 text-[13px] text-lo">
        <Icon name="search" size={15} />
        <span>선수, 구단, 리그 검색</span>
      </div>
      <div className="tnum text-[13px] font-semibold text-mid">{koDate(w.date)}</div>
    </header>
  );
}
