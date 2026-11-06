// 얇은 선 아이콘 (1.6px). 장식 없이 기능만.
const PATHS: Record<string, string> = {
  home: 'M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z',
  inbox: 'M4 13.5 6.2 5.7A1 1 0 0 1 7.2 5h9.6a1 1 0 0 1 1 .7L20 13.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 13.5h4.5l1.2 2h4.6l1.2-2H20',
  squad: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18.2 14.8c1.8.8 3 2.6 3.3 5.2',
  tactics: 'M4 4h16v16H4zM4 12h16M12 4v16M12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
  schedule: 'M4.5 6h15v14h-15zM4.5 10h15M8.5 3.5V7M15.5 3.5V7',
  table: 'M4 5h16M4 10h16M4 15h16M4 20h16M8 5v15',
  transfers: 'M5 8h13l-3.5-3.5M19 16H6l3.5 3.5',
  finance: 'M4 19V9M10 19V5M16 19v-7M21 19H3',
  club: 'M12 3 4.5 6v5.5c0 4.4 3.1 8.2 7.5 9.5 4.4-1.3 7.5-5.1 7.5-9.5V6z',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.3 15.3 20 20',
  arrow: 'M5 12h13M13 6l6 6-6 6',
  chevron: 'm9 6 6 6-6 6',
  back: 'm15 6-6 6 6 6',
  settings: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM19.4 13.5l1.4 1.1-1.6 2.8-1.7-.6a7 7 0 0 1-1.8 1l-.3 1.8h-3.2l-.3-1.8a7 7 0 0 1-1.8-1l-1.7.6-1.6-2.8 1.4-1.1a7 7 0 0 1 0-2.1L4.8 9.4l1.6-2.8 1.7.6a7 7 0 0 1 1.8-1L10.2 4.4h3.2l.3 1.8a7 7 0 0 1 1.8 1l1.7-.6 1.6 2.8-1.4 1.1a7 7 0 0 1 0 2.1z',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5h4',
};

export function Icon({ name, size = 18, className = '' }: { name: keyof typeof PATHS | string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}
