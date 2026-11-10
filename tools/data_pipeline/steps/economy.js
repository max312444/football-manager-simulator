// 구단 재정 · 명성 · 주급 다시 맞추기 (모든 리그 · 모든 시즌 같은 기준)
//
// 출처와 모델
//  - 실제 매출: 영어 위키백과 "Deloitte Football Money League" 문서의 시즌별 매출 상위 구단 표 (€ million).
//    표의 구단 문서 제목 → Wikidata 번호 → 구단 ID 로 연결 (이름 비교로 정하지 않음)
//  - 시즌 시작 재정은 지난 시즌 매출 기준 (지난 시즌 값이 없으면 그 시즌 값)
//  - 표에 없는 구단: 자체 추정 모델 (리그 평균 매출 × 시대 보정 × 선수단 전력 비중). 값은 대략적인 추정이며 실제 매출이 아님
//  - 매출에서 나머지를 정한다 (모든 구단 같은 규칙, 돈 많은 구단은 돈을 많이 들고 시작)
//      주급 예산(주) = 매출 × 0.62 ÷ 52, 선수 주급 = 주급 총액 매출 × 0.55 를 능력 비중(1.12^능력)으로 나눔
//      잔고 = 매출 × (0.08 + 0.32 × 부 순위), 이적 예산 = 매출 × (0.05 + 0.15 × 부 순위) (잔고 이하)
//        부 순위 = 그 시즌 전체 구단 중 매출 백분위 (0 ~ 1)
//      명성 = 55 + 8.5 × log2(시대 보정 매출 ÷ 3천만 유로), 35 ~ 97
//  node tools/data_pipeline economy [--season 2024-25] [--apply]
const fs = require('fs');
const path = require('path');
const { SEASONS_DIR, CANONICAL_DIR } = require('../config');
const { readJson } = require('../lib/util');
const { getJson } = require('../lib/http');
const wikipedia = require('../providers/wikipedia');
const wikidata = require('../providers/wikidata');

const MODEL_VERSION = 'pipeline-economy-v1';
const ML_TITLE = 'Deloitte Football Money League';
/** 리그 평균 매출 (2024년 기준, € million, 대략적인 모델 값) */
const LEAGUE_AVG_2024 = { eng1: 330, esp1: 180, ger1: 190, ita1: 140, fra1: 110, eng2: 30, ger2: 25, esp2: 15, ita2: 13, fra2: 12 };
const GROWTH = 1.065;   // 연 매출 성장 (2000년 ≈ 2024년의 22%)
const era = (year) => GROWTH ** (year - 2024);
const WAGE_RATIO = 0.62, WAGE_BILL = 0.55;
const WAGE_SLOPE = 1.12;   // 능력 1당 주급 비중 12%씩

const seasonOf = (y) => `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
const ovrOf = (p) => { const v = Object.values(p.attrs || {}); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 50; };

/** Money League 문서 → { 시즌: { 문서 제목: 매출(유로) } } */
async function moneyLeague(log) {
  const API = 'https://en.wikipedia.org/w/api.php?format=json&formatversion=2';
  const j = await getJson('wikipedia', `${API}&action=query&prop=revisions&rvprop=ids|content&rvslots=main&rvlimit=1&redirects=1&titles=${encodeURIComponent(ML_TITLE)}`);
  const rev = j.query.pages[0].revisions[0];
  const text = rev.slots.main.content;
  const out = {};
  const heads = [...text.matchAll(/^===\s*(\d{4})–(\d{2,4})\s*===/gm)];
  for (let i = 0; i < heads.length; i++) {
    const y = +heads[i][1];
    const body = text.slice(heads[i].index, heads[i + 1]?.index ?? text.length);
    // 순위표: "sortable" 표만 (나라별 합계 표 제외)
    const table = body.split(/\n\{\|/).find((t) => /sortable/.test(t.split('\n')[0]) || /Club/.test(t.slice(0, 400)));
    if (!table) continue;
    const rows = table.split(/\n\|-/).slice(1);
    const season = seasonOf(y);
    for (const row of rows) {
      const clean = row.replace(/<ref[^>]*\/>/g, '').replace(/<ref[\s\S]*?<\/ref>/g, '').replace(/\{\{flagicon\|[^}]*\}\}/gi, '');
      const cells = clean.split(/\n\||\|\||\n!/).map((c) => c.trim()).filter((c) => c !== '');
      const ci = cells.findIndex((c) => /\[\[/.test(c));
      if (ci < 0) continue;
      const link = cells[ci].match(/\[\[([^|\]]+)/)?.[1]?.trim();
      const num = cells.slice(ci + 1).map((c) => c.replace(/^[^|]*\|\s*(?=[\d.,]+$)/, '').replace(/,/g, '')).find((c) => /^\d+(\.\d+)?$/.test(c));
      if (!link || !num) continue;
      (out[season] ??= {})[link] = Math.round(+num * 1e6);
    }
  }
  log(`  Money League: ${Object.keys(out).length}개 시즌 · 문서 판 ${rev.revid}`);
  return { bySeason: out, revid: rev.revid };
}

/** 문서 제목 → 구단 ID (Wikidata 번호로) */
async function titleToClub(titles, log) {
  const canon = await wikipedia.resolveTitles(titles);
  const hits = await wikidata.byEnwikiTitles([...new Set(Object.values(canon).filter(Boolean))]);
  const clubsMap = readJson(path.join(CANONICAL_DIR, 'clubs.json'), {});
  const aliases = readJson(path.join(CANONICAL_DIR, 'club-aliases.json'), {});
  const byQid = new Map();
  for (const [id, v] of Object.entries(clubsMap)) if (v.wikidata && v.status === 'valid' && !byQid.has(v.wikidata)) byQid.set(v.wikidata, id);
  for (const [k, id] of Object.entries(aliases)) if (/^Q\d+$/.test(k)) byQid.set(k, id);
  const qidOfTitle = new Map(hits.map((h) => [h.enwiki, h.qid]));
  const out = {}, unmatched = [];
  for (const t of titles) {
    const q = qidOfTitle.get(canon[t]);
    const id = q && byQid.get(q);
    if (id) out[t] = id; else unmatched.push(t);
  }
  if (unmatched.length) log(`  게임에 없는 구단 (다른 나라 등) ${unmatched.length}개: ${unmatched.slice(0, 12).join(', ')}${unmatched.length > 12 ? ' …' : ''}`);
  return out;
}

async function economy({ apply, seasonFilter, log }) {
  log(`\n■ 구단 재정 · 명성 · 주급 다시 맞추기 (${apply ? '적용' : '미리보기'})`);
  const ml = await moneyLeague(log);
  const titles = [...new Set(Object.values(ml.bySeason).flatMap((s) => Object.keys(s)))];
  const clubOf = await titleToClub(titles, log);
  const known = {};   // 시즌 → 구단 → 매출
  for (const [s, rows] of Object.entries(ml.bySeason)) for (const [t, v] of Object.entries(rows)) if (clubOf[t]) (known[s] ??= {})[clubOf[t]] = v;

  // 모든 구단 시즌 파일
  const files = [];
  for (const s of fs.readdirSync(SEASONS_DIR).sort()) {
    if (seasonFilter && s !== seasonFilter) continue;
    for (const l of fs.readdirSync(path.join(SEASONS_DIR, s))) {
      if (!LEAGUE_AVG_2024[l]) continue;
      for (const f of fs.readdirSync(path.join(SEASONS_DIR, s, l))) {
        if (f.startsWith('_') || !f.endsWith('.json')) continue;
        const p = path.join(SEASONS_DIR, s, l, f);
        const text = fs.readFileSync(p, 'utf8');
        files.push({ p, text, d: JSON.parse(text), season: s, league: l });
      }
    }
  }
  // 매출 정하기
  const byLS = new Map();
  for (const x of files) { const k = `${x.season}/${x.league}`; (byLS.get(k) || byLS.set(k, []).get(k)).push(x); }
  let fromML = 0;
  for (const [k, xs] of byLS) {
    const [season, league] = k.split('/');
    const y = +season.slice(0, 4);
    const strength = (x) => { const o = x.d.squad.map(ovrOf).sort((a, b) => b - a).slice(0, 15); return o.reduce((a, b) => a + b, 0) / Math.max(1, o.length); };
    const ss = xs.map(strength);
    const mean = ss.reduce((a, b) => a + b, 0) / ss.length;
    const ws = ss.map((s) => Math.exp(0.2 * (s - mean)));
    const mw = ws.reduce((a, b) => a + b, 0) / ws.length;
    const avg = LEAGUE_AVG_2024[league] * 1e6 * era(y);
    xs.forEach((x, i) => {
      const prev = known[seasonOf(y - 1)]?.[x.d.club], cur = known[season]?.[x.d.club];
      const real = prev ?? cur;
      x.revenue = real ?? Math.round(avg * (0.45 + (0.55 * ws[i]) / mw));
      x.revenueSource = real ? `money-league:${prev ? seasonOf(y - 1) : season}` : 'model';
      if (real) fromML++;
    });
  }
  // 부 순위 (시즌별 전체 구단 중 매출 백분위) → 재정 · 명성 · 주급
  const bySeason = new Map();
  for (const x of files) (bySeason.get(x.season) || bySeason.set(x.season, []).get(x.season)).push(x);
  let changed = 0;
  const samples = [];
  for (const [season, xs] of bySeason) {
    const y = +season.slice(0, 4);
    const sorted = [...xs].sort((a, b) => a.revenue - b.revenue);
    sorted.forEach((x, i) => { x.pct = sorted.length > 1 ? i / (sorted.length - 1) : 0.5; });
    for (const x of xs) {
      const R = x.revenue;
      const balance = Math.round((R * (0.08 + 0.32 * x.pct)) / 1e5) * 1e5;
      const transferBudget = Math.min(balance, Math.round((R * (0.05 + 0.15 * x.pct)) / 1e5) * 1e5);
      const wageBudget = Math.round((R * WAGE_RATIO) / 52 / 1000) * 1000;
      const reputation = Math.max(35, Math.min(97, Math.round(55 + 8.5 * Math.log2(R / era(y) / 30e6))));
      const finance = { balance, transferBudget, wageBudget, revenue: Math.round(R / 1e5) * 1e5, revenueSource: x.revenueSource };
      // 선수 주급: 주급 총액을 능력 비중(1.12^능력)으로 나눔, 500 단위 · 최소 500
      const weights = x.d.squad.map((p) => WAGE_SLOPE ** ovrOf(p));
      const tw = weights.reduce((a, b) => a + b, 0) || 1;
      const bill = (R * WAGE_BILL) / 52;
      // 한 선수는 주급 총액의 7% 까지 (실제 최고 연봉 선수 비중)
      const wages = weights.map((wt) => Math.max(500, Math.round(Math.min((bill * wt) / tw, bill * 0.07) / 500) * 500));
      // 형식 유지: 필요한 값만 글자 단위로 바꾼다
      let text = x.text.replace(/"reputation":\s*\d+/, `"reputation": ${reputation}`)
        .replace(/"finance":\s*\{[^}]*\}/, `"finance": { "balance": ${balance}, "transferBudget": ${transferBudget}, "wageBudget": ${wageBudget}, "revenue": ${finance.revenue}, "revenueSource": "${finance.revenueSource}" }`);
      let i = 0;
      text = text.replace(/"wage":\s*\d+/g, (m) => (i < wages.length ? `"wage": ${wages[i++]}` : m));
      if (i !== wages.length) throw new Error(`주급 개수가 선수 수와 다름: ${x.p}`);
      if (text !== x.text) { changed++; if (apply) fs.writeFileSync(x.p, text); }
      if (['real-madrid', 'liverpool', 'man-city', 'bayern', 'psg', 'juventus', 'crystal-palace', 'getafe', 'hamburg', 'ssv-ulm-2'].includes(x.d.club) && (season === '2024-25' || season === '2005-06'))
        samples.push(`${season} ${x.d.club}: 매출 €${Math.round(R / 1e6)}M (${x.revenueSource}) · 잔고 €${Math.round(balance / 1e6)}M · 이적 €${Math.round(transferBudget / 1e6)}M · 주급 예산 €${Math.round(wageBudget / 1e3)}K/주 · 명성 ${x.d.reputation}→${reputation} · 최고 주급 €${Math.round(Math.max(...wages) / 1e3)}K`);
    }
  }
  log(`  구단 시즌 ${files.length}개 · 실제 매출(Money League) ${fromML}개 · 나머지 모델 추정 · 바뀌는 파일 ${changed}개`);
  for (const s of samples.sort()) log('  ' + s);
  if (!apply) log('  (미리보기 — --apply 로 저장)');
  return { files: files.length, fromML, changed, revid: ml.revid, version: MODEL_VERSION };
}

module.exports = { economy, moneyLeague };
