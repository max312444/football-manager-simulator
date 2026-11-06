// 가상 엠블럼: 실제 엠블럼 대신 구단 홈 유니폼 색과 약칭으로 만든 방패.
import { clubs } from '../../data/db';

export function Crest({ clubId, size = 36 }: { clubId: string; size?: number }) {
  const c = clubs.get(clubId);
  const p = c?.kits?.home.primary ?? '#2a2f2c';
  const s = c?.kits?.home.secondary ?? '#e9eeea';
  const short = (c?.short ?? clubId.slice(0, 3)).toUpperCase();
  const id = `cr-${clubId}`;
  return (
    <svg width={size} height={size * 1.15} viewBox="0 0 40 46" aria-label={c?.name ?? clubId}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p} />
          <stop offset="1" stopColor={p} stopOpacity="0.78" />
        </linearGradient>
      </defs>
      <path d="M20 1.5 37 6v15.5C37 32 29.8 40.6 20 44.5 10.2 40.6 3 32 3 21.5V6z" fill={`url(#${id})`} stroke={s} strokeOpacity="0.55" strokeWidth="1.5" />
      <path d="M20 5 33.5 8.6v12.9c0 8.4-5.6 15.4-13.5 18.8" fill="none" stroke={s} strokeOpacity="0.18" strokeWidth="1" />
      <text x="20" y="25.5" textAnchor="middle" fontSize="10.5" fontWeight="800" fill={s} letterSpacing="0.5"
        style={{ fontFamily: 'Pretendard Variable, sans-serif' }}>{short}</text>
    </svg>
  );
}
