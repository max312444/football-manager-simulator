import type { TableRow } from './types';

export const emptyRow = (club: string): TableRow => ({ club, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] });

export function applyResult(table: Record<string, TableRow>, home: string, away: string, hg: number, ag: number) {
  const upd = (r: TableRow, gf: number, ga: number) => {
    r.p++; r.gf += gf; r.ga += ga;
    const res = gf > ga ? 'W' : gf === ga ? 'D' : 'L';
    if (res === 'W') { r.w++; r.pts += 3; } else if (res === 'D') { r.d++; r.pts += 1; } else r.l++;
    r.form = [...r.form, res].slice(-5) as TableRow['form'];
  };
  upd(table[home], hg, ag);
  upd(table[away], ag, hg);
}

/** 순위: 승점 → 골득실 → 다득점 → 이름 */
export function sortTable(table: Record<string, TableRow>): TableRow[] {
  return Object.values(table).sort((a, b) =>
    b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || a.club.localeCompare(b.club));
}
