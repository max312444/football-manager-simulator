// 선수 포지션 바로잡기 (영어 위키백과 인포박스 'position' 기준)
//  Wikidata 포지션(P413)은 순서가 없고 대충 적힌 경우가 많다 (예: 페드로 "forward", 페드리 "centerhalf").
//  위키백과 인포박스는 주 포지션을 앞에 적는다 (예: 마스체라노 "Centre-back, defensive midfielder").
//
//  node tools/data_pipeline positions            인포박스 받기 → data/canonical/positions.json (실명, Git 제외) + 바뀔 내용 미리보기
//  node tools/data_pipeline positions --apply    data/seasons 시즌 파일에 적용
//
//  적용 규칙 (선수 · 시즌마다)
//   1) 그 시즌 위키백과 선수단 표의 묶음(GK/DF/MF/FW, 지금 포지션에서 알 수 있음) 안에 드는 인포박스 포지션 중 가장 앞의 것
//   2) 묶음 안에 없으면 인포박스 첫 포지션 (선수단 표가 없거나 틀린 경우)
//   3) 나머지 인포박스 포지션은 보조 포지션(alt, 게임에서 능력이 깎이지 않음). '윙어' · '풀백'처럼 쪽이 없으면 양쪽
//   4) 골키퍼 ↔ 필드 선수는 바꾸지 않는다 (동명이인 연결 오류일 수 있어 보고서에만)
//   5) 포지션이 바뀐 선수는 같은 능력(OVR)으로 새 포지션에 맞게 능력치를 다시 만든다 (model.attributes, 같은 시드)
const fs = require('fs');
const path = require('path');
const { getJson } = require('../lib/http');
const model = require('./model');
const { ensureMainBest } = require('./positionCheck');

const ROOT = path.join(__dirname, '..', '..', '..', 'data');
const SEASONS = path.join(ROOT, 'seasons');
const OUT = path.join(ROOT, 'canonical', 'positions.json');
const GROUP = { GK: 'GK', CB: 'DF', LB: 'DF', RB: 'DF', LWB: 'DF', RWB: 'DF', DM: 'MF', CM: 'MF', AM: 'MF', LM: 'MF', RM: 'MF', LW: 'FW', RW: 'FW', ST: 'FW' };

// ── 인포박스 글 → 포지션 코드 (앞에서부터 중요한 순) ──
const RULES = [
  [/goal ?keeper|goalie/, ['GK']],
  [/left[- ]?wing[- ]?back/, ['LWB']], [/right[- ]?wing[- ]?back/, ['RWB']], [/wing[- ]?back/, ['RWB', 'LWB']],
  [/left[- ]?(full[- ]?)?back|left defender/, ['LB']], [/right[- ]?(full[- ]?)?back|right defender/, ['RB']], [/full[- ]?back|side[- ]?back/, ['RB', 'LB']],
  [/cent(re|er)[- ]?(back|half)|central defender|sweeper|libero|stopper/, ['CB']],
  [/defensive midfield|holding midfield|deep[- ]lying playmaker|regista|anchor/, ['DM']],
  [/attacking midfield|playmaker|trequartista|number 10/, ['AM']],
  [/left (wide )?midfield|left[- ]sided midfield/, ['LM']], [/right (wide )?midfield|right[- ]sided midfield/, ['RM']], [/wide midfield/, ['RM', 'LM']],
  [/left[- ]?wing(er)?\b|left forward/, ['LW']], [/right[- ]?wing(er)?\b|right forward/, ['RW']], [/winger|wide forward|inside forward|wing\b/, ['RW', 'LW']],
  [/second striker|support striker|deep[- ]lying forward|false (nine|9)/, ['ST', 'AM']],
  [/striker|cent(re|er)[- ]?forward|target man/, ['ST']],
  [/forward/, ['ST', 'RW', 'LW']],   // '공격수' 뭉뚱그림: 스트라이커 · 윙어 모두
  [/wing[- ]?half/, ['CM']],
  [/cent(re|er)(al)? midfield|box[- ]to[- ]box|mezzala|half[- ]?back/, ['CM']],
  [/midfield/, ['CM', 'DM', 'AM']],   // '미드필더' 뭉뚱그림
  [/defender|defence/, ['CB', 'RB', 'LB']],   // '수비수' 뭉뚱그림
];

function cleanValue(v) {
  return v
    .replace(/<ref[^>]*\/>/gi, '').replace(/<ref[\s\S]*?<\/ref>/gi, '').replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{\{\s*(?:hlist|flatlist|plainlist|ubl|unbulleted list|nowrap|small)\s*\|?/gi, '').replace(/\{\{[^{}]*\}\}/g, '').replace(/\}\}/g, '')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1').replace(/<br\s*\/?>/gi, ',').replace(/'''?/g, '');
}
function parsePositions(text) {
  // '| position = …' 값 (다음 '|' 줄 또는 '}}' 전까지, 여러 줄 목록 포함)
  const m = text.match(/\n\s*\|\s*positions?\s*=([\s\S]*?)(?=\n\s*\||\n\}\})/i);
  if (!m) return null;
  const raw = cleanValue(m[1]).trim();
  if (!raw) return null;
  return { raw: raw.replace(/\s+/g, ' ').slice(0, 160), codes: codesOf(raw).all };
}
// 뭉뚱그린 말 ('Forward' · 'Midfielder' · 'Defender'): 포지션을 바꾸는 근거로는 쓰지 않고, 보조 포지션과 '맞는 범위' 판단에만
const GENERIC = new Set([/forward/, /midfield/, /defender|defence/].map(String));
/** 인포박스 포지션 글 → 코드. spec = 구체적인 포지션(앞이 주 포지션) · gen = 뭉뚱그린 말에서 나온 범위 · all = 둘을 합친 것 */
function codesOf(raw) {
  const parts = String(raw).toLowerCase().split(/[,/;\n*|]| or | and |&/).map((x) => x.trim()).filter(Boolean);
  const spec = [], gen = [];
  for (const part of parts) {
    const hit = RULES.find(([re]) => re.test(part));
    if (!hit) continue;
    const into = GENERIC.has(String(hit[0])) ? gen : spec;
    for (const c of hit[1]) if (!into.includes(c)) into.push(c);
  }
  const all = [...spec, ...gen.filter((c) => !spec.includes(c))];
  return { spec, gen, all };
}

// ── 받기 ──
async function enwikiTitles(qids, log) {
  const out = {};
  for (let i = 0; i < qids.length; i += 50) {
    const chunk = qids.slice(i, i + 50);
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=sitelinks&sitefilter=enwiki&ids=${chunk.join('|')}`;
    const j = await getJson('wikidataApi', url);
    const ents = (j.data ?? j).entities ?? {};
    for (const [q, e] of Object.entries(ents)) if (e.sitelinks?.enwiki) out[q] = e.sitelinks.enwiki.title;
    if ((i / 50) % 40 === 0) log(`  위키백과 문서 이름 ${Math.min(i + 50, qids.length)} / ${qids.length}`);
  }
  return out;
}
async function infoboxes(titles, log) {
  const out = {};
  for (let i = 0; i < titles.length; i += 50) {
    const chunk = titles.slice(i, i + 50);
    const url = `https://en.wikipedia.org/w/api.php?format=json&formatversion=2&action=query&prop=revisions&rvprop=content&rvslots=main&rvsection=0&redirects=1&titles=${encodeURIComponent(chunk.join('|'))}`;
    const j = await getJson('wikipedia', url);
    const q = (j.data ?? j).query ?? {};
    // 넘긴 제목 → 실제 문서 (정규화 · 넘겨주기)
    const map = new Map(chunk.map((t) => [t, t]));
    for (const n of q.normalized ?? []) for (const [k, v] of map) if (v === n.from) map.set(k, n.to);
    for (const r of q.redirects ?? []) for (const [k, v] of map) if (v === r.from) map.set(k, r.to);
    const byTitle = new Map((q.pages ?? []).map((p) => [p.title, p.revisions?.[0]?.slots?.main?.content ?? '']));
    for (const [orig, final] of map) out[orig] = byTitle.get(final) ?? '';
    if ((i / 50) % 40 === 0) log(`  인포박스 ${Math.min(i + 50, titles.length)} / ${titles.length}`);
  }
  return out;
}

// ── 시즌 파일 ──
function* seasonFiles() {
  for (const s of fs.readdirSync(SEASONS).sort()) for (const l of fs.readdirSync(path.join(SEASONS, s))) for (const f of fs.readdirSync(path.join(SEASONS, s, l))) {
    if (!f.startsWith('_') && f.endsWith('.json')) yield { season: s, league: l, file: path.join(SEASONS, s, l, f) };
  }
}

/**
 * 지금 능력치에서 원래 OVR 되찾기 (모델이 만든 능력치 = OVR + 포지션 편차 + 고정 흔들림)
 * 모델이 만든 게 아니면 (예: 초기 잉글랜드 데이터의 선수별 추정치) null → 능력치는 그대로 두고 포지션만 바꾼다
 */
function recoverOvr(attrs, pos, key) {
  const vals = Object.entries(attrs).filter(([, v]) => v > 1 && v < 99).map(([k, v]) => v - model.deltaOf(pos, k) - model.jitter(`${key}:${k}`));
  if (vals.length < 5 || Math.max(...vals) - Math.min(...vals) > 1) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

/**
 * 이 시즌 포지션 · 보조 포지션. info = codesOf() 결과 ({ spec, gen, all }) 또는 코드 배열
 *  1) 지금 포지션이 구체적인 위키백과 포지션에 있으면 그대로
 *  2) 이 시즌 선수단 묶음(GK/DF/MF/FW) 안의 구체적인 포지션 중 가장 앞
 *  3) 지금 포지션이 뭉뚱그린 범위 안이면 그대로 (예: 'Forward' 인데 지금 LW)
 *  4) 구체적인 포지션이 있으면 그 첫 번째 (묶음과 맞지 않아도 위키백과를 따른다)
 *  5) 뭉뚱그린 말뿐이면 바꾸지 않는다 (예: 'Midfielder' 뿐인데 지금 LW → LW)
 */
function choose(cur, info) {
  const { spec, gen } = Array.isArray(info) ? { spec: info, gen: [] } : info;
  const isGK = cur === 'GK';
  const ok = (c) => (c === 'GK') === isGK;
  const s = spec.filter(ok), gn = gen.filter(ok);
  if (!spec.length && !gen.length) return null;
  if (!s.length && !gn.length) return { gkConflict: true };
  const g = GROUP[cur];
  let pos = s.includes(cur) ? cur : s.find((c) => GROUP[c] === g) ?? (gn.includes(cur) ? cur : s[0] ?? cur);
  const usable = [...s, ...gn.filter((c) => !s.includes(c))];
  // 위키백과가 방향 없이 적었으면 ('Winger' · 'Full-back' → 양쪽) 지금 방향을 유지 (왼쪽 윙어가 오른쪽으로 바뀌지 않게)
  const mirror = (a, b) => a.length === b.length && a.length >= 2 && a.slice(1) === b.slice(1) && a[0] !== b[0] && 'LR'.includes(a[0]) && 'LR'.includes(b[0]);
  if (usable.includes(cur) && mirror(pos, cur)) pos = cur;
  const alt = usable.filter((c) => c !== pos).slice(0, 3);
  return { pos, alt };
}

async function positions({ apply, log }) {
  const pm = JSON.parse(fs.readFileSync(path.join(ROOT, 'canonical', 'players.json'), 'utf8'));
  const reg = pm.players ?? pm;
  // 시즌 파일에 나오는 선수만
  const ids = new Set();
  for (const { file } of seasonFiles()) for (const p of JSON.parse(fs.readFileSync(file, 'utf8')).squad ?? []) ids.add(p.id);
  log(`시즌 파일 선수 ${ids.size}명`);

  let store = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { source: 'English Wikipedia infobox (MediaWiki API) · CC BY-SA 4.0', players: {} };
  const need = [...ids].filter((id) => !store.players[id] && reg[id]?.wikidata);
  if (need.length) {
    log(`인포박스를 받을 선수 ${need.length}명`);
    const qOf = Object.fromEntries(need.map((id) => [id, reg[id].wikidata]));
    const titles = await enwikiTitles([...new Set(Object.values(qOf))], log);
    const tList = [...new Set(need.map((id) => titles[qOf[id]]).filter(Boolean))];
    const boxes = await infoboxes(tList, log);
    for (const id of need) {
      const t = titles[qOf[id]];
      const parsed = t ? parsePositions(boxes[t] ?? '') : null;
      store.players[id] = { title: t ?? null, raw: parsed?.raw ?? null, codes: parsed?.codes ?? [] };
    }
    fs.writeFileSync(OUT, JSON.stringify(store, null, 1));
    log(`저장: ${path.relative(process.cwd(), OUT)}`);
  }
  // 저장된 원문을 지금 규칙으로 다시 읽는다 (규칙을 고쳐도 다시 받지 않아도 됨)
  for (const v of Object.values(store.players)) { v.parsed = codesOf(v.raw ?? ''); v.codes = v.parsed.all; }
  const found = [...ids].filter((id) => store.players[id]?.codes?.length).length;
  log(`인포박스 포지션이 있는 선수 ${found} / ${ids.size} (${Math.round((found / ids.size) * 100)}%)`);

  // 사람이 직접 고친 포지션 (자동보다 우선, 실명이라 Git 제외)
  //  data/canonical/positions-override.json: { "선수ID": { "pos": "CB", "alt": ["DM"], "seasons": { "2009-10": { "pos": "DM" } }, "note": "..." } }
  const OVERRIDE = path.join(ROOT, 'canonical', 'positions-override.json');
  const over = fs.existsSync(OVERRIDE) ? JSON.parse(fs.readFileSync(OVERRIDE, 'utf8')) : {};
  if (Object.keys(over).length) log(`수동 수정 ${Object.keys(over).length}명 (positions-override.json, 자동보다 우선)`);

  // 바뀔 내용
  const stat = { files: 0, rows: 0, changed: 0, regen: 0, kept: 0, boosted: 0, remodel: 0, altSet: 0, gkConflict: 0, noBox: 0 };
  const examples = new Map();
  const review = new Map();   // 뭉뚱그린 말뿐인데 지금 포지션이 그 범위 밖 → 자동으로 못 정함 (사람이 확인)
  const moves = {};
  for (const { season, file } of seasonFiles()) {
    const c = JSON.parse(fs.readFileSync(file, 'utf8'));
    let dirty = false;
    for (const p of c.squad ?? []) {
      stat.rows++;
      const info = store.players[p.id];
      const o = over[p.id];
      const manual = o ? { pos: o.seasons?.[season]?.pos ?? o.pos, alt: o.seasons?.[season]?.alt ?? o.alt ?? [] } : null;
      if (!manual?.pos && !info?.codes?.length) { stat.noBox++; continue; }
      const r = manual?.pos ? { pos: manual.pos, alt: manual.alt.filter((x) => x !== manual.pos) } : choose(p.pos, info.parsed);
      if (!manual?.pos && info?.parsed && !info.parsed.spec.length && info.parsed.gen.length && p.pos !== 'GK' && !info.parsed.gen.includes(p.pos)) review.set(p.id, [season, c.club, p.name, p.pos, info.raw].join('\t'));
      if (!r) continue;
      if (r.gkConflict) { stat.gkConflict++; continue; }
      const altOld = JSON.stringify(p.alt ?? []);
      if (r.pos !== p.pos) {
        stat.changed++;
        const k = `${p.pos}→${r.pos}`;
        moves[k] = (moves[k] ?? 0) + 1;
        examples.set(`${p.id}|${season}`, [season, c.club, p.name, `${p.pos} → ${r.pos}${r.alt.length ? ` (보조 ${r.alt.join('/')})` : ''}`, manual?.pos ? `수동 수정${o.note ? ` · ${o.note}` : ''}` : info.raw].join('\t'));
        if (apply) {
          const key = `${p.id}:${season}`;
          const ovr = recoverOvr(p.attrs, p.pos, key);
          if (ovr != null) { p.attrs = model.attributes(ovr, r.pos, key); stat.regen++; } else stat.kept++;
          p.pos = r.pos;
        }
        dirty = true;
      }
      if (JSON.stringify(r.alt) !== altOld) { stat.altSet++; if (apply) { if (r.alt.length) p.alt = r.alt; else delete p.alt; } dirty = true; }
    }
    // 주 포지션 능력이 가장 높게 (다른 자리가 더 높으면 주 포지션이 쓰는 능력치를 올림)
    for (const p of c.squad ?? []) {
      const copy = { ...p, attrs: { ...p.attrs } };
      // 모델이 만든 능력치는 고친 공식(스트라이커 위치 선정 · 측면 미드 · 윙백)으로 같은 OVR 로 다시 만든다
      const key = `${p.id}:${season}`;
      const ovr = recoverOvr(copy.attrs, copy.pos, key);
      if (ovr != null) { const fresh = model.attributes(ovr, copy.pos, key); if (JSON.stringify(fresh) !== JSON.stringify(copy.attrs)) { copy.attrs = fresh; stat.remodel++; dirty = true; } }
      if (ensureMainBest(copy)) { stat.boosted++; dirty = true; }
      if (apply) p.attrs = copy.attrs;
    }
    if (dirty) stat.files++;
    if (apply && dirty) fs.writeFileSync(file, JSON.stringify(c, null, 2) + '\n');
  }
  log(`선수 · 시즌 ${stat.rows}줄 · 포지션 바뀜 ${stat.changed}${apply ? ` (능력치 새로 ${stat.regen} · 그대로 ${stat.kept})` : ''} · 고친 공식으로 다시 만든 능력치 ${stat.remodel} · 주 포지션이 가장 높게 능력치 올림 ${stat.boosted} · 보조 포지션 바뀜 ${stat.altSet} · 인포박스 없음 ${stat.noBox} · 골키퍼 충돌(그대로 둠) ${stat.gkConflict} · 파일 ${stat.files}개`);
  log('많이 바뀐 방향: ' + Object.entries(moves).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${k} ${v}`).join(' · '));
  const report = path.join(ROOT, '_pipeline', 'reports', 'positions.txt');
  fs.mkdirSync(path.dirname(report), { recursive: true });
  // 엑셀로 열어 볼 수 있는 표 (탭 구분, 한글 깨지지 않게 BOM)
  fs.writeFileSync(report, '﻿' + ['시즌\t구단\t선수\t이전 → 이후\t근거 (위키백과 원문)', ...examples.values()].join('\n'));
  const reviewFile = path.join(ROOT, '_pipeline', 'reports', 'positions-review.txt');
  fs.writeFileSync(reviewFile, '﻿' + ['시즌(처음)\t구단\t선수\t지금 포지션\t위키백과 원문 (뭉뚱그림)', ...review.values()].join('\n'));
  log(`확인 필요 (위키백과가 뭉뚱그려서 자동으로 못 정함, 그대로 둠): ${review.size}명 → ${path.relative(process.cwd(), reviewFile)}`);
  log(`선수별 변경 목록: ${path.relative(process.cwd(), report)} (${examples.size}줄)`);
  log(apply ? '적용했습니다. 이어서 publish --apply 로 공개용 데이터도 다시 만드세요.' : '미리보기입니다. 적용하려면 --apply');
}

module.exports = { positions, parsePositions, choose, codesOf };
