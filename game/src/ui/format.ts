import type { AttrKey } from '../data/types';

export const ATTR_KO: Record<AttrKey, string> = {
  sho: '슈팅', pas: '패스', dri: '드리블', tac: '태클', pos: '위치 선정', aer: '공중볼',
  pac: '속도', sta: '체력', str: '몸싸움', vis: '시야', com: '침착성', ldr: '리더십',
  ref: '반사 신경', han: '핸들링', one: '일대일',
};

export const ATTR_GROUPS: { title: string; keys: AttrKey[] }[] = [
  { title: '기술', keys: ['sho', 'pas', 'dri', 'tac', 'aer'] },
  { title: '정신', keys: ['pos', 'vis', 'com', 'ldr'] },
  { title: '신체', keys: ['pac', 'sta', 'str'] },
];
export const GK_GROUP: { title: string; keys: AttrKey[] } = { title: '골키퍼', keys: ['ref', 'han', 'one'] };

/** 능력치 등급 색 (텍스트) */
export function ratingTone(v: number): string {
  if (v >= 85) return 'text-neon';
  if (v >= 78) return 'text-[#a6f08a]';
  if (v >= 70) return 'text-hi';
  if (v >= 60) return 'text-mid';
  return 'text-lo';
}
/** 능력치 막대 색 */
export function ratingBar(v: number): string {
  if (v >= 85) return 'bg-neon';
  if (v >= 78) return 'bg-[#8fe06f]';
  if (v >= 70) return 'bg-[#c9d2cb]';
  if (v >= 60) return 'bg-[#6f7a73]';
  return 'bg-[#454d48]';
}

const won = new Intl.NumberFormat('ko-KR');
/** 주급 (EUR) → "€ 12.3만" 대신 FM처럼 "€123K" 표기 */
export function money(eur: number): string {
  if (eur >= 1_000_000) return `€${(eur / 1_000_000).toFixed(eur >= 10_000_000 ? 0 : 1)}M`;
  if (eur >= 1_000) return `€${Math.round(eur / 1_000)}K`;
  return `€${won.format(eur)}`;
}

export function koDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const w = '일월화수목금토'[d.getDay()];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${w})`;
}

/** 한국어 조사: 마지막 글자에 받침이 있으면 a, 없으면 b (한글이 아니면 b) */
export function josa(word: string, a: string, b: string): string {
  const c = word.trim().charCodeAt(word.trim().length - 1);
  if (c < 0xac00 || c > 0xd7a3) return b;
  return (c - 0xac00) % 28 ? a : b;
}

/** 경기 라운드 표시: 정규 리그 "12라운드", 플레이오프 "승격 PO 준결승 1차전" 등 */
export function roundLabel(f: { round: number; stage?: string; leg?: number; name?: string }): string {
  if (f.stage === 'cup' || f.stage === 'euro') return f.name ?? '컵 대회';
  if (!f.stage) return `${f.round}라운드`;
  const name = ({ semi: '승격 PO 준결승', final: '승격 PO 결승', ladder: '승격 PO', barrage: '승강 플레이오프' } as Record<string, string>)[f.stage] ?? '플레이오프';
  return f.leg ? `${name} ${f.leg}차전` : name;
}
