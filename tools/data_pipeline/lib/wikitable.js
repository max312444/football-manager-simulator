// 위키백과 표(wikitable) 읽기: {| ... |} 를 행 · 칸으로 (rowspan · colspan 반영)
//  - 머리글 행(! 칸만 있는 앞쪽 행)은 칸별 이름을 이어 붙여 headers 로 ("Exit date Departed on")
//  - 칸 내용은 원문(위키 문법) 그대로 — 사람 · 날짜 읽기는 아래 도우미로
'use strict';

// [[ ]] · {{ }} 밖의 구분자로 나누기
function splitTop(s, sep) {
  const out = [];
  let depth = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2);
    if (two === '[[' || two === '{{') { depth++; cur += two; i++; continue; }
    if ((two === ']]' || two === '}}') && depth > 0) { depth--; cur += two; i++; continue; }
    if (depth === 0 && s.startsWith(sep, i)) { out.push(cur); cur = ''; i += sep.length - 1; continue; }
    cur += s[i];
  }
  out.push(cur);
  return out;
}

const ATTR_RE = /^\s*([\w-]+\s*=\s*("[^"]*"|'[^']*'|[^\s"']+)\s*)+$/;

// "rowspan=2 | 내용" → { attrs, content }
function cellOf(raw) {
  const parts = splitTop(raw, '|');
  if (parts.length > 1 && ATTR_RE.test(parts[0])) return { attrs: parts[0], content: parts.slice(1).join('|') };
  return { attrs: '', content: raw };
}
const span = (attrs, name) => {
  const m = attrs.match(new RegExp(`${name}\\s*=\\s*["']?(\\d+)`, 'i'));
  return m ? Math.max(1, Math.min(60, +m[1])) : 1;
};

// 문서 안의 모든 표: [{ heading, headers: [칸 이름], rows: [[칸 원문]] }]
function parseTables(wikitext) {
  // 주석 · 각주는 미리 지운다 (여러 줄 각주 안의 "|..." 줄이 새 칸으로 읽히지 않게)
  const text = wikitext.replace(/<!--[\s\S]*?-->/g, '').replace(/<ref(?:\s[^>]*)?\/>/gi, '').replace(/<ref(?:\s[^>]*)?>[\s\S]*?<\/ref>/gi, '');
  const lines = text.split('\n');
  const tables = [];
  let heading = '';
  let stack = [];
  for (const line0 of lines) {
    const line = line0.trim();
    const h = line.match(/^(=+)\s*(.*?)\s*\1$/);
    if (h) {
      // 닫히지 않은 표는 새 제목에서 끝난 것으로 본다
      while (stack.length) tables.push(buildTable(stack.pop()));
      heading = h[2];
      continue;
    }
    if (line.startsWith('{|')) { stack.push({ heading, raw: [] }); continue; }
    if (!stack.length) continue;
    const t = stack[stack.length - 1];
    if (line.startsWith('|}')) {
      stack.pop();
      tables.push(buildTable(t));
      if (stack.length) stack[stack.length - 1].raw.push({ kind: 'text', s: '(표)' });
      continue;
    }
    if (line.startsWith('|-')) t.raw.push({ kind: 'row' });
    else if (line.startsWith('|+')) continue;
    else if (line.startsWith('!')) t.raw.push({ kind: 'cells', head: true, cells: splitTop(line.slice(1), '!!').flatMap((c) => splitTop(c, '||')) });
    else if (line.startsWith('|')) t.raw.push({ kind: 'cells', head: false, cells: splitTop(line.slice(1), '||') });
    else t.raw.push({ kind: 'text', s: line });
  }
  while (stack.length) tables.push(buildTable(stack.pop()));
  return tables;
}

function buildTable({ heading, raw }) {
  // 행 나누기
  const rows = [];
  let cur = null;
  for (const r of raw) {
    if (r.kind === 'row') { cur = null; continue; }
    if (r.kind === 'text') { if (cur && cur.cells.length) cur.cells[cur.cells.length - 1].content += '\n' + r.s; continue; }
    if (!cur) { cur = { head: true, cells: [] }; rows.push(cur); }
    for (const c of r.cells) { const x = cellOf(c); cur.cells.push({ ...x, head: r.head }); }
    if (!r.head) cur.head = false;
  }
  // 격자 (rowspan · colspan)
  const grid = [];
  const pending = [];   // 열별 { left, content }
  for (const row of rows) {
    const out = [];
    let col = 0;
    const take = () => { while (pending[col] && pending[col].left > 0) { out[col] = pending[col].content; pending[col].left--; col++; } };
    take();
    for (const c of row.cells) {
      take();
      const rs = span(c.attrs, 'rowspan'), cs = span(c.attrs, 'colspan');
      for (let k = 0; k < cs; k++) {
        out[col] = c.content.trim();
        if (rs > 1) pending[col] = { left: rs - 1, content: c.content.trim() };
        col++;
      }
    }
    take();
    grid.push({ head: row.head && row.cells.every((c) => c.head), cells: out });
  }
  // 앞쪽 머리글 행
  let i = 0;
  const headRows = [];
  while (i < grid.length && grid[i].head) headRows.push(grid[i++].cells);
  const width = Math.max(0, ...grid.map((g) => g.cells.length));
  const headers = [];
  for (let c = 0; c < width; c++) {
    const parts = [];
    for (const hr of headRows) { const v = plainText(hr[c] ?? ''); if (v && parts[parts.length - 1] !== v) parts.push(v); }
    headers.push(parts.join(' '));
  }
  return { heading, headers, rows: grid.slice(i).filter((g) => !g.head).map((g) => g.cells) };
}

// 위키 문법 → 보이는 글자 (대략)
function plainText(s) {
  return (s || '')
    .replace(/<ref(?:\s[^>]*)?\/>/gi, '').replace(/<ref(?:\s[^>]*)?>[\s\S]*?<\/ref>/gi, '')
    .replace(/\{\{\s*(?:abbr|abbrlink)\s*\|([^|}]*)\|[^}]*\}\}/gi, '$1')
    .replace(/\{\{\s*(?:sortname)\s*\|([^|}]*)\|([^|}]*)(?:\|[^}]*)?\}\}/gi, '$1 $2')
    .replace(/\{\{\s*(?:ill|interlanguage link)\s*\|([^|}]*)(?:\|[^}]*)?\}\}/gi, '$1')
    .replace(/\{\{\s*(?:nowrap|nobr|small|nwr)\s*\|([^}]*)\}\}/gi, '$1')
    .replace(/\{\{[^{}]*\}\}/g, '').replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')
    .replace(/'''?/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
const pad = (n) => String(n).padStart(2, '0');

// 칸의 첫 날짜 → "YYYY-MM-DD" (없으면 null)
function parseDate(s) {
  if (!s) return null;
  const t = s.replace(/<ref(?:\s[^>]*)?\/>/gi, '').replace(/<ref(?:\s[^>]*)?>[\s\S]*?<\/ref>/gi, '');
  let m = t.match(/\{\{\s*(?:dts|start date|date|dtsort|sort date|birth date|end date)\s*\|(?:\s*\w+\s*=[^|}]*\|)*\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})/i);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[0];
  const p = plainText(t);
  m = p.match(/(\d{1,2})\s+([A-Za-z]+)\.?,?\s+(\d{4})/);
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(m[1])}`;
  m = p.match(/([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m && MONTHS[m[1].toLowerCase()]) return `${m[3]}-${pad(MONTHS[m[1].toLowerCase()])}-${pad(m[2])}`;
  m = t.match(/\{\{\s*dts\s*\|\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i);
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(m[1])}`;
  return null;
}

// 칸의 첫 사람: { title (영어 위키백과 문서 · 없으면 null), name, caretaker }
function parsePerson(s) {
  const p = parsePerson0(s);
  // 사람 이름처럼 보이지 않으면 (날짜 · 숫자 · 틀 인자) 버린다
  if (!p || !p.name || /[0-9=|{}<>]/.test(p.name) || p.name.length > 45) return null;
  return p;
}
function parsePerson0(s) {
  if (!s) return null;
  const t = s.replace(/<ref(?:\s[^>]*)?\/>/gi, '').replace(/<ref(?:\s[^>]*)?>[\s\S]*?<\/ref>/gi, '');
  // 여러 명(<br>)이면 첫 사람
  const first = t.split(/<br\s*\/?>|\n/i).find((x) => /\[\[|\{\{\s*(sortname|ill|interlanguage)/i.test(x) || plainText(x).length > 2) ?? t;
  const caretaker = /caretaker|interim|\(c\)|acting|provisional|\bad interim\b/i.test(first);
  const flag = first.match(/\{\{\s*(?:flagicon|flagdeco|flag)\s*\|\s*([A-Z]{3})\b/)?.[1] ?? null;
  let m = first.match(/\{\{\s*sortname\s*\|([^|}]*)\|([^|}]*)(?:\|([^|}]*))?[^}]*\}\}/i);
  if (m) {
    const name = `${m[1].trim()} ${m[2].trim()}`.trim();
    const title = m[3] && !/^\s*nolink\s*=/i.test(m[3]) && !/=/.test(m[3]) ? m[3].trim() : name;
    return { title, name, caretaker, flag };
  }
  m = first.match(/\{\{\s*(?:ill|interlanguage link)\s*\|([^|}]*)/i);
  if (m) return { title: null, name: m[1].trim(), caretaker, flag };
  for (const lm of first.matchAll(/\[\[([^|\]#]+)(?:\|([^\]]*))?\]\]/g)) {
    const title = lm[1].trim();
    if (/^(file|image|category|wikt|w):/i.test(title)) continue;
    return { title, name: plainText(lm[2] ?? lm[1]).replace(/\s*\(.*?\)\s*/g, ' ').trim(), caretaker, flag };
  }
  const name = plainText(first).replace(/\((caretaker|interim|c)\)/gi, '').trim();
  if (!name || /^[-–—?]+$|^(tbd|tba|vacant|none|n\/a)$/i.test(name)) return null;
  return { title: null, name, caretaker, flag };
}

// 칸의 구단: 링크 제목 · 보이는 이름
function parseTeam(s) {
  const t = (s || '').replace(/<ref(?:\s[^>]*)?>[\s\S]*?<\/ref>/gi, '').replace(/<ref(?:\s[^>]*)?\/>/gi, '');
  const m = t.match(/\[\[([^|\]#]+)(?:\|([^\]]*))?\]\]/);
  return { title: m ? m[1].trim() : null, name: plainText(t) };
}

module.exports = { parseTables, plainText, parseDate, parsePerson, parseTeam, splitTop };
