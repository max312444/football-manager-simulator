// 영어 위키백과 제공자 (MediaWiki API 사용, 스크래핑 아님)
// 라이선스: CC BY-SA 4.0 — 배포 시 출처 표기·동일 조건 공유 의무가 생길 수 있음 (source 메타데이터에 기록)
// 구단 문서를 특정 날짜 시점의 판(revision)으로 받아 1군 선수단 템플릿({{Fs player}})을 읽는다
const { getJson } = require('../lib/http');

const API = 'https://en.wikipedia.org/w/api.php?format=json&formatversion=2';

// [[ ]] / {{ }} 안의 | 는 나누지 않는 템플릿 인자 분리
function splitParams(body) {
  const out = [];
  let depth = 0, cur = '';
  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2);
    if (two === '[[' || two === '{{') { depth++; cur += two; i++; continue; }
    if (two === ']]' || two === '}}') { depth--; cur += two; i++; continue; }
    if (body[i] === '|' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += body[i];
  }
  out.push(cur);
  return out;
}

// 중첩 템플릿을 고려해 {{Fs player ...}} 본문을 찾는다
function findTemplates(text, names) {
  const re = new RegExp(`\\{\\{\\s*(?:${names.join('|')})\\s*\\|`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(text))) {
    let depth = 1, i = m.index + 2;
    while (i < text.length && depth > 0) {
      if (text.startsWith('{{', i)) { depth++; i += 2; } else if (text.startsWith('}}', i)) { depth--; i += 2; } else i++;
    }
    out.push(text.slice(m.index + m[0].length, i - 2));
  }
  return out;
}

const linkTitle = (s) => s?.match(/\[\[([^|\]#]+)/)?.[1]?.trim() ?? null;
const plain = (s) => s?.replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1').replace(/\{\{[^}]*\}\}/g, '').replace(/'''?/g, '').trim() ?? null;

const EXCLUDE_SECTION = /loan|reserve|youth|academy|primavera|giovanili|juniors?|amateur|next gen|under[- ]?\d|u-?\d{2}|\bb team|\bii\b|\bb squad|retired|former|notable|staff|women|futsal|record|captain|history|kit|sponsor|transfer/i;

// 1군 선수단 섹션(제목에 squad/players)의 Fs player만 모은다. 임대 나감·유스·B팀 섹션은 제외
function firstTeamPlayers(wikitext) {
  const parts = wikitext.split(/^(=+)\s*(.*?)\s*\1\s*$/m);
  // parts: [앞부분, 등호, 제목, 본문, 등호, 제목, 본문, ...]
  const rows = [];
  let inSquad = false, squadLevel = 0;
  for (let i = 1; i < parts.length; i += 3) {
    const level = parts[i].length, heading = parts[i + 1], body = parts[i + 2] || '';
    if (/squad|players/i.test(heading) && !EXCLUDE_SECTION.test(heading)) { inSquad = true; squadLevel = level; }
    else if (inSquad && level <= squadLevel) inSquad = false;
    if (!inSquad || EXCLUDE_SECTION.test(heading)) continue;
    // 같은 섹션 안의 "out on loan" 표 이후는 제외
    const cut = body.search(/out on loan|on loan to other clubs|loaned out/i);
    const scope = cut > 0 ? body.slice(0, cut) : body;
    for (const t of findTemplates(scope, ['Fs player', 'football squad player', 'Fs2 player'])) {
      const f = {};
      splitParams(t).forEach(p => { const k = p.indexOf('='); if (k > 0) f[p.slice(0, k).trim().toLowerCase()] = p.slice(k + 1).trim(); });
      const name = f.name || '';
      const other = f.other || '';
      rows.push({
        number: /^\d{1,2}$/.test(f.no || '') ? Number(f.no) : null,
        nat: (f.nat || '').toUpperCase() || null,
        posGroup: (f.pos || '').toUpperCase() || null,
        title: linkTitle(name),
        name: plain(name),
        loanFrom: /on loan from/i.test(other) ? linkTitle(other.slice(other.search(/on loan from/i))) || plain(other.replace(/.*on loan from/i, '')) : null,
      });
    }
  }
  return rows;
}

async function squadAt(title, date, opts) {
  const url = `${API}&action=query&prop=revisions&rvprop=ids|timestamp|content&rvslots=main&rvlimit=1&rvdir=older&redirects=1`
    + `&rvstart=${date}T00:00:00Z&titles=${encodeURIComponent(title)}`;
  const j = await getJson('wikipedia', url, opts);
  const rev = j.query?.pages?.[0]?.revisions?.[0];
  if (!rev) return { title, revid: null, players: [] };
  return { title, revid: rev.revid, timestamp: rev.timestamp, players: firstTeamPlayers(rev.slots.main.content) };
}

// 링크 제목 → 현재 문서 제목 (넘겨주기·표기 정규화 반영), 50개씩
async function resolveTitles(titles, opts) {
  const out = {};
  for (let i = 0; i < titles.length; i += 50) {
    const chunk = titles.slice(i, i + 50);
    const j = await getJson('wikipedia', `${API}&action=query&redirects=1&titles=${encodeURIComponent(chunk.join('|'))}`, opts);
    const step = new Map();
    for (const n of j.query?.normalized || []) step.set(n.from, n.to);
    for (const r of j.query?.redirects || []) step.set(r.from, r.to);
    const missing = new Set((j.query?.pages || []).filter(p => p.missing).map(p => p.title));
    for (const t of chunk) {
      let cur = t;
      for (let k = 0; k < 3 && step.has(cur); k++) cur = step.get(cur);
      out[t] = missing.has(cur) ? null : cur;
    }
  }
  return out;
}

// 문서 본문의 일반 문서 링크 목록 (시즌 문서에서 참가 구단 찾기용)
async function pageLinks(title, opts) {
  const j = await getJson('wikipedia', `${API}&action=parse&prop=links&redirects=1&page=${encodeURIComponent(title)}`, opts);
  return (j.parse?.links || []).filter(l => l.ns === 0 && l.exists).map(l => l.title);
}

// 시즌 문서의 리그 순위표에 있는 구단 문서 제목만 뽑는다
//  - {{#invoke:Sports table|...|team1=RMA|...|name_RMA=[[Real Madrid CF|Real Madrid]]}}
//  - 옛 형식 {{Fb cl team |p=1 |t=[[Real Madrid C.F.|Real Madrid]] ...}}
function leagueTableTeams(wikitext) {
  wikitext = wikitext.replace(/<!--[\s\S]*?-->/g, '');   // HTML 주석 제거
  const out = [];
  for (const body of findTemplates(wikitext, ['#invoke:\\s*[Ss]ports table'])) {
    const f = {};
    splitParams(body).forEach(p => { const k = p.indexOf('='); if (k > 0) f[p.slice(0, k).trim()] = p.slice(k + 1).trim(); });
    let codes = Object.keys(f).filter(k => /^team\d+$/.test(k)).sort((a, b) => +a.slice(4) - +b.slice(4)).map(k => f[k]);
    if (!codes.length && f.team_order) codes = f.team_order.split(',').map(x => x.trim()).filter(Boolean);
    const titles = codes.map(c => linkTitle(f[`name_${c}`] || '')).filter(Boolean);
    if (titles.length >= 16) { out.push(titles); }
  }
  // 최근 문서: 순위표는 별도 틀로 빼고, 같은 문서의 결과표({{#invoke:sports results|team_order=…|name_XXX=…}})에 전체 구단이 있다
  if (!out.length) {
    for (const body of findTemplates(wikitext, ['#invoke:\\s*[Ss]ports results'])) {
      const f = {};
      splitParams(body).forEach(p => { const k = p.indexOf('='); if (k > 0) f[p.slice(0, k).trim()] = p.slice(k + 1).trim(); });
      const codes = (f.team_order || '').split(',').map(s => s.trim()).filter(Boolean);
      const titles = codes.map(c => linkTitle(f[`name_${c}`] || '')).filter(Boolean);
      if (titles.length >= 16) { out.push(titles); break; }
    }
  }
  if (!out.length) {
    const titles = findTemplates(wikitext, ['[Ff]b cl team'])
      .map(b => { const m = splitParams(b).find(p => /^\s*t\s*=/.test(p)); return m ? linkTitle(m) : null; })
      .filter(Boolean);
    if (titles.length >= 16) out.push(titles);
  }
  // 문서에 표가 여러 개(전반기·후반기 등)면 첫 번째 정규 리그 표
  return out[0] || [];
}

async function seasonTableTeams(title, opts) {
  const url = `${API}&action=query&prop=revisions&rvprop=ids|content&rvslots=main&rvlimit=1&redirects=1&titles=${encodeURIComponent(title)}`;
  const j = await getJson('wikipedia', url, opts);
  const rev = j.query?.pages?.[0]?.revisions?.[0];
  if (!rev) return { title, revid: null, teams: [] };
  return { title, revid: rev.revid, teams: leagueTableTeams(rev.slots.main.content) };
}

module.exports = { squadAt, firstTeamPlayers, resolveTitles, pageLinks, seasonTableTeams, leagueTableTeams };
