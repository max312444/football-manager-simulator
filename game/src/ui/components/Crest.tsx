// 구단 엠블럼
// 1) assets/crests/<id> 파일이 있으면 그 이미지
// 2) 구단 파일의 crest 항목 (파이프라인 publish 단계에서 넣음): 모양 · 색 · 무늬 · 가운데 문장 · 머리글자
// 3) 설정이 없으면 유니폼 색 기반 기본형
// 실제 로고 그림은 복제하지 않는다. 문장(대포 · 새 · 왕관 …)은 일반적인 문장 요소로 직접 그린 것.
import { useId } from 'react';
import { clubs } from '../../data/db';
import { NATION_SHAPE, type CrestCharge, type CrestPattern, type CrestShape, type CrestStyle } from '../crests/types';

const files = import.meta.glob<string>('../../assets/crests/*.{png,svg,webp}', { eager: true, import: 'default', query: '?url' });
const FILE = new Map(Object.entries(files).map(([p, url]) => [p.split('/').pop()!.replace(/\.\w+$/, ''), url]));

const W = 100, H = 116;
const SHAPES: Record<CrestShape, string> = {
  shield: 'M8 8 H92 V54 C92 84 72 102 50 111 C28 102 8 84 8 54 Z',
  cut: 'M20 6 H80 L92 18 V56 C92 85 72 102 50 111 C28 102 8 85 8 56 V18 Z',
  pointed: 'M8 12 Q50 2 92 12 V62 C92 88 74 102 50 112 C26 102 8 88 8 62 Z',
  round: 'M50 12 A46 46 0 1 1 49.99 12 Z',
  oval: 'M50 6 C75 6 90 30 90 58 C90 88 74 110 50 110 C26 110 10 88 10 58 C10 30 25 6 50 6 Z',
  diamond: 'M50 6 L95 58 L50 110 L5 58 Z',
};
const HAS_HEADER: Record<CrestShape, boolean> = { shield: true, cut: true, pointed: true, round: false, oval: false, diamond: false };

function luminance(hex: string) {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const ink = (bg: string) => (luminance(bg) > 0.45 ? '#141414' : '#f4f4f2');
const FONT = { fontFamily: 'Pretendard Variable, sans-serif' };

function fallbackStyle(id: string): CrestStyle {
  const c = clubs.get(id);
  const p = c?.kits?.home.primary ?? '#2a2f2c', s = c?.kits?.home.secondary ?? '#f4f4f2';
  const kp = c?.kits?.home.pattern;
  const pattern: CrestPattern = kp === 'stripes' || kp === 'hoops' || kp === 'halves' || kp === 'sash' ? kp : 'solid';
  return { shape: NATION_SHAPE[c?.nation ?? ''] ?? 'shield', colors: [p, s, s], pattern, charge: 'ball' };
}

function Pattern({ kind, color }: { kind: CrestPattern; color: string }) {
  switch (kind) {
    case 'stripes': return <g fill={color}>{[0, 1, 2, 3, 4].map((i) => <rect key={i} x={14 + i * 16} y={0} width={8} height={H} />)}</g>;
    case 'hoops': return <g fill={color}>{[0, 1, 2, 3, 4].map((i) => <rect key={i} x={0} y={18 + i * 20} width={W} height={10} />)}</g>;
    case 'halves': return <rect x={50} y={0} width={50} height={H} fill={color} />;
    case 'quarters': return <g fill={color}><rect x={50} y={0} width={50} height={58} /><rect x={0} y={58} width={50} height={58} /></g>;
    case 'sash': return <path d="M-10 30 L30 -10 L110 70 L70 110 Z" fill={color} transform="translate(0 6)" />;
    case 'band': return <rect x={0} y={44} width={W} height={26} fill={color} />;
    default: return null;
  }
}

/** 가운데 문장. -12~12 좌표로 그리고 위치·크기는 바깥에서 맞춘다 */
function Charge({ kind, color, bg }: { kind: Exclude<CrestCharge, 'letters'>; color: string; bg: string }) {
  switch (kind) {
    case 'ball':
      return (
        <g>
          <circle r={11} fill="#f4f4f2" stroke="#141414" strokeWidth={0.8} />
          <path d="M0 -4.2 L4 -1.3 L2.5 3.4 L-2.5 3.4 L-4 -1.3 Z" fill="#141414" />
          <g stroke="#141414" strokeWidth={0.9} fill="none">
            <path d="M0 -4.2 V-8.5 M4 -1.3 L8.2 -2.6 M2.5 3.4 L5 7.2 M-2.5 3.4 L-5 7.2 M-4 -1.3 L-8.2 -2.6" />
          </g>
          <g fill="#141414">
            <path d="M-2.6 -10.6 L2.6 -10.6 L0 -8.5 Z" /><path d="M10.4 -1 L9 3.6 L8.2 -2.6 Z" /><path d="M-10.4 -1 L-9 3.6 L-8.2 -2.6 Z" />
            <path d="M3.2 10.4 L7.5 7.6 L5 7.2 Z" /><path d="M-3.2 10.4 L-7.5 7.6 L-5 7.2 Z" />
          </g>
        </g>
      );
    case 'crown':
      return (
        <g fill={color}>
          <path d="M-11 5 L-12 -6 L-5.5 -0.5 L0 -9.5 L5.5 -0.5 L12 -6 L11 5 Z" />
          <rect x={-11} y={6.5} width={22} height={3.5} rx={0.8} />
          <circle cx={-12} cy={-7.5} r={1.6} /><circle cx={0} cy={-11} r={1.6} /><circle cx={12} cy={-7.5} r={1.6} />
          <circle cx={0} cy={1.5} r={1.6} fill={bg} />
        </g>
      );
    case 'cannon':
      return (
        <g fill={color}>
          <path d="M-12 -1.5 L8.5 -8 L10.5 -4.2 L-10.5 2.8 Z" />
          <rect x={9} y={-9.4} width={3} height={6.2} rx={1} transform="rotate(-18 10.5 -6.3)" />
          <circle cx={-3} cy={4.5} r={5} fill="none" stroke={color} strokeWidth={2.2} />
          <circle cx={-3} cy={4.5} r={1.4} />
          <rect x={-12} y={10} width={24} height={2} rx={1} />
        </g>
      );
    case 'bird':
      // 서 있는 새 (옆모습): 몸통 · 들어 올린 날개 · 부리 · 다리
      return (
        <g fill={color}>
          <path d="M-4 9 C-8 6 -9 0 -6 -3 C-4 -5 -1 -5 1 -4 L2 -7 C2.5 -9.5 5 -10.5 7 -9 L11.5 -8 L7.6 -6.6 C7.4 -4.4 6.4 -2.6 5 -1.4 C6.6 2.4 5 7 1 9 Z" />
          <path d="M-5 -2 C-9 -5 -11 -9 -10.5 -12 C-7.5 -10.5 -4.5 -8.5 -2.5 -5 Z" />
          <path d="M-2 8.5 L-3 12 M2 8.5 L3 12" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
          <circle cx={4.6} cy={-7} r={0.9} fill={bg} />
        </g>
      );
    case 'star':
      return <path fill={color} d="M0 -12 L3.5 -4.2 L12 -3.7 L5.6 1.9 L7.4 10.3 L0 5.9 L-7.4 10.3 L-5.6 1.9 L-12 -3.7 L-3.5 -4.2 Z" />;
    case 'tower':
      return (
        <g>
          <path fill={color} d="M-8 11 V-3 H-10 V-11 H-6.2 V-7.6 H-2 V-11 H2 V-7.6 H6.2 V-11 H10 V-3 H8 V11 Z" />
          <path fill={bg} d="M-2.6 11 V5 A2.6 2.6 0 0 1 2.6 5 V11 Z" />
          <rect x={-1} y={-3} width={2} height={4} fill={bg} />
        </g>
      );
    case 'cross':
      return <path fill={color} d="M-2.8 -12 H2.8 V-2.8 H12 V2.8 H2.8 V12 H-2.8 V2.8 H-12 V-2.8 H-2.8 Z" />;
    case 'fleur':
      return (
        <g fill={color}>
          <path d="M0 -12 C3.4 -8 4.4 -3.6 1.6 0.6 V4 H-1.6 V0.6 C-4.4 -3.6 -3.4 -8 0 -12 Z" />
          <path d="M1.6 4 C5 4 9.4 3.6 9 -1.6 C11.8 0 12.4 4.4 10 7 C8 9 4.6 8.6 2 7 Z" />
          <path d="M-1.6 4 C-5 4 -9.4 3.6 -9 -1.6 C-11.8 0 -12.4 4.4 -10 7 C-8 9 -4.6 8.6 -2 7 Z" />
          <rect x={-6} y={3.6} width={12} height={2.4} rx={0.6} />
          <path d="M-1.6 6 H1.6 V11.5 H-1.6 Z" />
        </g>
      );
  }
}

/** 어두운 화면에서 잘 보이는 구단 색 (유니폼 주색 → 너무 어두우면 보조색 → 회색) */
export function clubColor(id: string): string {
  const c = clubs.get(id);
  const st = c?.crest?.colors;
  const cand = [c?.kits?.home.primary, c?.kits?.home.secondary, st?.[0], st?.[1]].filter((x): x is string => !!x && /^#[0-9a-f]{3,6}$/i.test(x));
  return cand.find((x) => contrast(x, '#101412') >= 3) ?? '#a8b0ab';
}

export function Crest({ clubId, size = 36 }: { clubId: string; size?: number }) {
  const uid = useId().replace(/:/g, '');
  const master = clubs.get(clubId);
  const name = master?.name ?? clubId;
  const file = FILE.get(clubId);
  if (file) return <img src={file} width={size} height={size * 1.16} alt={name} style={{ objectFit: 'contain', flexShrink: 0 }} />;

  const st = master?.crest ?? fallbackStyle(clubId);
  const charge: CrestCharge = st.charge ?? 'letters';
  const [base, second, rim] = st.colors;
  // 문장이 있으면 가운데 띠 무늬는 쓰지 않는다 (문장과 겹침)
  const pattern: CrestPattern = charge !== 'letters' && st.pattern === 'band' ? 'solid' : st.pattern;
  const mark = (st.mark ?? master?.short ?? clubId.slice(0, 3)).toUpperCase();
  const d = SHAPES[st.shape];
  const round = st.shape === 'round';
  const detailed = size >= 40;          // 머리띠 · 고리 글자 · 창단 연도
  const showCharge = size >= 22;
  const header = HAS_HEADER[st.shape] && detailed;
  const busy = pattern !== 'solid' && pattern !== 'band';
  const cy = header ? 66 : 58;

  // 문장 색: 지정색 → 무늬색(대비 충분할 때) → 바탕 대비색
  const chargeColor = st.markColor ?? (contrast(second, base) >= 2.2 ? second : ink(base));
  const plateBg = busy ? base : base;
  const letterBg = pattern === 'band' ? second : busy ? rim : base;
  const letterFill = st.markColor && !busy && contrast(st.markColor, letterBg) >= 2.5 ? st.markColor : ink(letterBg);
  const fs = mark.length >= 4 ? 15 : mark.length === 3 ? 19 : mark.length === 2 ? 24 : 32;
  const ring = round && detailed;
  const founded = master?.founded;

  return (
    <svg width={size} height={size * 1.16} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={name} style={{ flexShrink: 0 }}>
      <defs>
        <clipPath id={`c${uid}`}><path d={d} /></clipPath>
        <linearGradient id={`s${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.07" />
          <stop offset="1" stopColor="#000" stopOpacity="0.16" />
        </linearGradient>
      </defs>

      {/* 바탕 + 무늬 */}
      <g clipPath={`url(#c${uid})`}>
        <rect width={W} height={H} fill={base} />
        <Pattern kind={pattern} color={second} />
        {header && <rect x={0} y={0} width={W} height={31} fill={rim} />}
        {header && <rect x={0} y={31} width={W} height={1.5} fill={ink(rim)} opacity={0.35} />}
        <rect width={W} height={H} fill={`url(#s${uid})`} />
      </g>

      {/* 테두리: 원형은 이름 고리, 나머지는 두 겹 테두리 */}
      {ring ? (
        <>
          <path d={d} fill="none" stroke={rim} strokeWidth={15} />
          <circle cx={50} cy={58} r={38.5} fill="none" stroke={ink(rim)} strokeOpacity={0.45} strokeWidth={0.8} />
          <circle cx={50} cy={58} r={45.5} fill="none" stroke={ink(rim)} strokeOpacity={0.3} strokeWidth={0.8} />
          <path id={`r${uid}`} d="M50 100 A42 42 0 1 1 50.01 100" fill="none" />
          <text fontSize={8} fontWeight={700} letterSpacing={1.4} fill={ink(rim)} style={FONT}>
            <textPath href={`#r${uid}`} startOffset="50%" textAnchor="middle">
              {name.toUpperCase().slice(0, 28)}{founded ? `  ·  ${founded}` : ''}
            </textPath>
          </text>
        </>
      ) : (
        <>
          <path d={d} fill="none" stroke={rim} strokeWidth={6} strokeLinejoin="round" />
          <path d={d} fill="none" stroke={ink(rim)} strokeOpacity={0.35} strokeWidth={0.9}
            transform="translate(50 58) scale(0.9) translate(-50 -58)" />
        </>
      )}

      {/* 머리띠 글자 */}
      {header && charge !== 'letters' && (
        <text x={50} y={21} textAnchor="middle" fontSize={mark.length >= 4 ? 11 : 13} fontWeight={800} letterSpacing={1.5} fill={ink(rim)} style={FONT}>{mark}</text>
      )}
      {st.star && !header && (
        <path d="M50 14 l2.9 6 6.6.9-4.8 4.6 1.2 6.5L50 28.9l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z" fill={rim} transform="translate(0 4)" />
      )}

      {/* 가운데: 문장 또는 머리글자 */}
      {charge !== 'letters' && showCharge ? (
        <g transform={`translate(50 ${cy})`}>
          {busy && charge !== 'ball' && <circle r={22} fill={plateBg} stroke={rim} strokeWidth={2} />}
          <g transform={`scale(${charge === 'ball' ? 1.55 : busy ? 1.45 : 1.85})`}>
            <Charge kind={charge} color={busy ? (contrast(rim, base) >= 2.2 ? rim : ink(base)) : chargeColor} bg={busy ? base : base} />
          </g>
        </g>
      ) : showCharge || size >= 24 ? (
        <>
          {busy && <rect x={50 - (fs * mark.length * 0.36 + 8)} y={cy - fs * 0.62} width={(fs * mark.length * 0.36 + 8) * 2} height={fs * 1.24} rx={4} fill={letterBg} />}
          <text x={50} y={cy} dy="0.36em" textAnchor="middle" fontSize={fs} fontWeight={800} fill={letterFill} letterSpacing={mark.length >= 4 ? 0 : 0.5} style={FONT}>{mark}</text>
        </>
      ) : null}

      {/* 창단 연도 (방패형, 충분히 클 때) */}
      {header && size >= 56 && founded && !busy && (
        <text x={50} y={st.shape === 'pointed' ? 98 : 96} textAnchor="middle" fontSize={8} fontWeight={700} letterSpacing={1} fill={ink(base)} opacity={0.8} style={FONT}>
          {founded}
        </text>
      )}
    </svg>
  );
}
