// 위키백과 정보 상자 (캐시)에서 선수 경력: 구단별 기간 · 리그 출전 · 득점, 성인 대표팀 기간 · 출전 · 득점
//  캐시: data/_pipeline/cache/wikipedia (positions 단계가 받아 둔 rvsection=0 응답) — 네트워크 없음
//  돌려주는 값: id → { stints: [{ from, to, club, loan, apps, goals }], caps, intlGoals, intl: [{ from, to, caps, goals }] }
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..', 'data');
const CACHE = path.join(ROOT, '_pipeline', 'cache', 'wikipedia');
const POSFILE = path.join(ROOT, 'canonical', 'positions.json');

/** 캐시에서 문서 제목 → 첫머리 위키 문법 (넘겨주기 · 표기 정리 포함) */
function loadWikitext() {
  const byTitle = new Map();
  const alias = new Map();
  for (const d of fs.readdirSync(CACHE)) {
    const dir = path.join(CACHE, d);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) {
      const raw = fs.readFileSync(path.join(dir, f), 'utf8');
      if (!raw.includes('rvsection=0')) continue;
      const q = JSON.parse(raw).body?.query;
      if (!q) continue;
      for (const r of [...(q.normalized ?? []), ...(q.redirects ?? [])]) alias.set(r.from, r.to);
      for (const p of q.pages ?? []) {
        const t = p.revisions?.[0]?.slots?.main?.content;
        if (t) byTitle.set(p.title, t);
      }
    }
  }
  return (title) => {
    let t = title;
    for (let i = 0; i < 3 && !byTitle.has(t) && alias.has(t); i++) t = alias.get(t);
    return byTitle.get(t) ?? null;
  };
}

const clean = (s) => (s ?? '').replace(/<!--[\s\S]*?-->/g, '').replace(/<ref[\s\S]*?(<\/ref>|\/>)/g, '').replace(/\{\{[^}]*\}\}/g, '').trim();
/** [[문서|보이는 글]] → 보이는 글 */
const linkText = (s) => clean(s).replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1').trim();
/** 숫자 (링크 안이면 보이는 글의 숫자) */
const num = (s) => { const m = linkText(s).replace(/[()]/g, '').match(/\d+/); return m ? +m[0] : null; };
/** 기간 '2004–2021' · '2023–' · '2016' */
function years(s) {
  const y = clean(s);
  const m = y.match(/(\d{4})\s*(?:[–-]\s*(\d{4})?)?/);
  if (!m) return null;
  const open = !m[2] && /[–-]\s*$/.test(y);
  return { from: +m[1], to: m[2] ? +m[2] : open ? 2026 : +m[1] };
}

/** 정보 상자 필드 (처음 나온 값) */
function fields(text) {
  const out = {};
  for (const m of text.matchAll(/\|\s*([a-z_]+\d*)\s*=\s*([^\n]*)/g)) if (!(m[1] in out)) out[m[1]] = m[2];
  return out;
}

function parseCareer(text) {
  const f = fields(text);
  const stints = [];
  for (let i = 1; i <= 40; i++) {
    const club = f[`clubs${i}`];
    if (club == null) continue;
    const y = years(f[`years${i}`] ?? '');
    if (!y) continue;
    stints.push({ ...y, club: linkText(club).replace(/^→\s*/, ''), loan: /→/.test(club) || /loan/i.test(club), apps: num(f[`caps${i}`]), goals: num(f[`goals${i}`]) });
  }
  // 성인 대표팀 (예전 문서 nationalteam1 · 요즘 문서 national_team1). 연령별 · 올림픽 · B팀은 뺀다
  const intl = [];
  for (let i = 1; i <= 15; i++) {
    const g = (k) => f[`national${k}${i}`] ?? f[`national_${k}${i}`];
    const team = linkText(g('team') ?? '');
    if (!team || /U-?\d{2}|under|olympic|amateur|\bB\b/i.test(team)) continue;
    intl.push({ ...(years(g('years') ?? '') ?? { from: null, to: null }), caps: num(g('caps')) ?? 0, goals: num(g('goals')) ?? 0 });
  }
  return { stints, caps: intl.reduce((a, x) => a + x.caps, 0), intlGoals: intl.reduce((a, x) => a + x.goals, 0), intl };
}

/** 2군 · 유스 팀 (예: Bayern Munich II · Real Madrid Castilla · Barcelona B · Jong Ajax · U23) */
const RESERVE = /\b(II|III|B|C|U-?\d{2}|Under-?\d{2}|Reserves?|Youth|Juniors?|Academy|Primavera)\b|Castilla|Atlètic|Jong |Amateure|\bAm\.\b/i;
const isReserve = (club) => RESERVE.test(club);

/**
 * 이 시즌(시작 연도 y) 그 구단 기간: 시즌을 덮는 기간 중 구단 이름이 비슷하고, 임대가 아니고, 출전이 많은 쪽.
 * 1군 기간이 없고 2군 기간만 있으면 { reserve: true } — 1군 명단에만 이름을 올린 2군 선수 (출전 거의 없음)
 */
function stintFor(career, y, clubNames) {
  const all = career.stints.filter((s) => s.from <= y && (s.to > y || s.to === y));
  const cover = all.filter((s) => !isReserve(s.club));
  if (!cover.length) return all.length ? { reserve: true, club: all[0].club, apps: null, goals: null, from: all[0].from, to: all[0].to } : null;
  const norm = (x) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\b(fc|cf|afc|ac|sc|ssc|as|us|rc|club|de|calcio|football|f c)\b/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const names = clubNames.map(norm).filter((x) => x.length >= 3);
  const score = (s) => { const n = norm(s.club); return names.some((x) => n.includes(x) || x.includes(n)) ? 2 : 0; };
  return [...cover].sort((a, b) => score(b) - score(a) || +a.loan - +b.loan || (b.apps ?? 0) - (a.apps ?? 0))[0];
}

/** 그 시즌까지의 성인 대표팀 출전 (기간 안에서 고르게 나눠서) */
function capsBy(career, y) {
  let n = 0;
  for (const x of career.intl) {
    if (x.from == null || x.from > y) continue;
    const span = Math.max(1, x.to - x.from + 1);
    n += x.caps * Math.min(1, (y - x.from + 1) / span);
  }
  return Math.round(n);
}

function careers() {
  const get = loadWikitext();
  const box = JSON.parse(fs.readFileSync(POSFILE, 'utf8')).players;
  const out = {};
  for (const [id, v] of Object.entries(box)) {
    if (!v.title) continue;
    const t = get(v.title);
    if (t) out[id] = parseCareer(t);
  }
  return out;
}

module.exports = { careers, parseCareer, stintFor, capsBy };
