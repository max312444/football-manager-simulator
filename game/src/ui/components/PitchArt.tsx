// 타이틀 배경: 원근감 있는 피치 라인. 장식이므로 아주 옅게.
export function PitchArt() {
  // 원근 변환: 위쪽(먼 쪽)은 좁고 아래쪽(가까운 쪽)은 넓은 사다리꼴
  const W = 1000, H = 620;
  const top = { y: 90, l: 330, r: 670 };
  const bot = { y: 600, l: -40, r: 1040 };
  const at = (u: number, v: number) => {
    // u: 0(왼)~1(오), v: 0(먼 골라인)~1(가까운 골라인). 원근 보정으로 v를 비선형으로
    const vv = v ** 1.35;
    const y = top.y + (bot.y - top.y) * vv;
    const l = top.l + (bot.l - top.l) * vv;
    const r = top.r + (bot.r - top.r) * vv;
    return [l + (r - l) * u, y] as const;
  };
  const line = (pts: [number, number][]) => 'M' + pts.map(([u, v]) => at(u, v).join(' ')).join(' L ');
  const rect = (u0: number, v0: number, u1: number, v1: number) =>
    line([[u0, v0], [u1, v0], [u1, v1], [u0, v1], [u0, v0]]);
  const ellipse = (cu: number, cv: number, ru: number, rv: number, from = 0, to = Math.PI * 2) => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 64; i++) {
      const a = from + ((to - from) * i) / 64;
      pts.push([cu + ru * Math.cos(a), cv + rv * Math.sin(a)]);
    }
    return line(pts);
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#39ff14" stopOpacity="0" />
          <stop offset="0.35" stopColor="#39ff14" stopOpacity="0.22" />
          <stop offset="1" stopColor="#39ff14" stopOpacity="0.5" />
        </linearGradient>
        <radialGradient id="glow" cx="0.5" cy="0.62" r="0.55">
          <stop offset="0" stopColor="#39ff14" stopOpacity="0.10" />
          <stop offset="1" stopColor="#39ff14" stopOpacity="0" />
        </radialGradient>
        <filter id="soft"><feGaussianBlur stdDeviation="2.2" /></filter>
      </defs>
      <rect width={W} height={H} fill="url(#glow)" />
      {/* 잔디 줄무늬 */}
      {Array.from({ length: 10 }, (_, i) => (
        <path key={i} d={rect(0, i / 10, 1, (i + 0.5) / 10) + ' Z'} fill="#39ff14" opacity={0.012} />
      ))}
      <g stroke="url(#fade)" strokeWidth="1.4" fill="none">
        <path d={rect(0, 0, 1, 1)} />
        <path d={line([[0, 0.5], [1, 0.5]])} />
        <path d={ellipse(0.5, 0.5, 0.135, 0.09)} />
        <path d={rect(0.21, 0, 0.79, 0.16)} />
        <path d={rect(0.37, 0, 0.63, 0.055)} />
        <path d={ellipse(0.5, 0.16, 0.1, 0.045, 0, Math.PI)} />
        <path d={rect(0.21, 0.84, 0.79, 1)} />
        <path d={rect(0.37, 0.945, 0.63, 1)} />
        <path d={ellipse(0.5, 0.84, 0.1, 0.045, Math.PI, Math.PI * 2)} />
      </g>
      {/* 센터 서클 위 은은한 빛 */}
      <path d={ellipse(0.5, 0.5, 0.135, 0.09)} stroke="#39ff14" strokeOpacity="0.35" strokeWidth="3" fill="none" filter="url(#soft)" />
    </svg>
  );
}
