// 능력치 재구성: 원래 기준 실력(재능) + 새 실력 공식 + 실제 포지션 → 능력치 다시 만들기
//  node tools/data_pipeline rebuild            점검만 (data/_pipeline/reports/rebuild.json · 화면 요약)
//  node tools/data_pipeline rebuild --apply    적용 (적용 전 data/_pipeline/backup-seasons-before-rebuild 에 백업)
//
// 실력은 '진짜 실력': 지명도는 보조 신호일 뿐, 실제로 뛴 기록과 이후 경력(지난 시즌은 결과를 안다)으로 정한다
// 1) 원래 기준 실력: 포지션 교정 전 백업(backup-seasons-before-positions)의 능력치에서 되찾아
//    재능 점수 S (지명도 + 대표팀, 원래 공식 model.overall 을 거꾸로 풀어 나이 · 리그를 뺀 값)
// 2) 시즌 기록 점수 (seasonEvidence): 위키백과 정보 상자 (careerStats.js, 캐시) 의 그 구단 기간 시즌당 리그 출전 · 득점
//      S ×0.3 + 구단 명성 × 출전 비중 + 주전 보너스 + 득점력 (포지션별, 작게) + 이후 3시즌 안에 더 큰 구단 (숨은 에이스)
//      그 시즌 2군 기간만 있으면 1군 출전 거의 없음
// 3) 경력 전체 참고: 선수마다 기록 점수 상위 3시즌 평균 = 전성기. 시즌 점수 = 기록 절반 + 전성기 절반 + 나이
//      나이: 25세 미만 −0.9/년 · 30세 넘어 −1.2/년 (34세 넘어 −0.6 더, 최대 −8), 30대 정상급 구단 주전이면 절반 (최대 −4)
// 4) 시즌 · 포지션 묶음(GK · DF · MF · FW)마다 1부 리그 점수 순위 → 목표 분포로 펼침 (중앙 71 · 상위 10% 81 · 1% 88 · 최상위 94)
// 5) 포지션: 지금 데이터 (위키백과 · 사람 검수 · 패치 반영) 그대로 + 앞뒤 3시즌의 주 포지션을 보조로 (최대 3개)
// 6) 능력치 = model.attributes(실력, 주 포지션, 같은 흔들림) → 주 포지션 오버롤이 실력과 같게 전체를 같은 만큼 옮김
// 결과 (2026-11-12): 메시 15-16 93 · 판데이크 20-21 94 · 리버풀 20-21 살라 94 · 피르미누 87, 번리 20-21 72~79, 숨은 에이스 예: 찰리 오스틴 (QPR)
const fs = require('fs');
const path = require('path');
const model = require('./model');
const { ratingAt } = require('./positionCheck');
const { careers, stintFor } = require('./careerStats');

/** 능력치 만들기: 모델 능력치를 만든 뒤 모든 능력치를 같은 만큼 옮겨 주 포지션 오버롤 = 목표 실력 (포지션 편차만큼 높게 나오지 않게, 자리 간 순서는 그대로) */
function attrsFor(ovr, pos, key) {
  const a = model.attributes(ovr, pos, key);
  const d = Math.round(ratingAt(a, pos) - ovr);
  if (d) for (const k of Object.keys(a)) if (k !== 'ldr') a[k] = clamp(a[k] - d, 1, 99);
  return a;
}

const ROOT = path.join(__dirname, '..', '..', '..', 'data');
const SEASONS = path.join(ROOT, 'seasons');
const BEFORE = path.join(ROOT, '_pipeline', 'backup-seasons-before-positions');
const BAK = path.join(ROOT, '_pipeline', 'backup-seasons-before-rebuild');
const LS = { eng1: 1.0, esp1: 1.0, ita1: 0.98, ger1: 0.97, fra1: 0.93, eng2: 0.86, ger2: 0.83, esp2: 0.82, ita2: 0.82, fra2: 0.8 };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** 원래 기준 실력 되찾기 (정확 → 근사) */
function recoverBase(attrs, pos, key) {
  const raw = Object.entries(attrs).filter(([, v]) => v > 1 && v < 99);
  const exact = raw.map(([k, v]) => v - model.deltaOf(pos, k) - model.jitter(`${key}:${k}`));
  if (exact.length >= 5 && Math.max(...exact) - Math.min(...exact) <= 1) return { base: exact.reduce((a, b) => a + b, 0) / exact.length, exact: true };
  const approx = raw.map(([k, v]) => v - model.deltaOf(pos, k));
  return { base: approx.reduce((a, b) => a + b, 0) / Math.max(1, approx.length), exact: false };
}
/** 원래 공식의 나이 보정 */
const oldAgeAdj = (age) => (age < 26 ? -(26 - age) * 1.5 : age > 31 ? -(age - 31) * 1.2 : 0);
/** 재능 점수 S (지명도 + 대표팀): base = (62 + S + 나이보정 − 40) × 리그 + 40 를 거꾸로 */
const talentOf = (base, age, league) => (base - 40) / (LS[league] ?? 0.9) + 40 - 62 - oldAgeAdj(age);

/** 재능 → 전성기 실력 (구간 직선) */
const CURVE = [[-12, 60], [-5, 63], [0, 67], [5, 71], [10, 76], [15, 82], [20, 87], [25, 91], [30, 93]];
function peakOf(S) {
  if (S <= CURVE[0][0]) return CURVE[0][1];
  for (let i = 1; i < CURVE.length; i++) if (S <= CURVE[i][0]) { const [x0, y0] = CURVE[i - 1], [x1, y1] = CURVE[i]; return y0 + ((S - x0) / (x1 - x0)) * (y1 - y0); }
  return CURVE.at(-1)[1];
}
function ageAdj(age) {
  if (age < 19) return -(25 - 19) * 1.0 - (19 - age) * 1.3;
  if (age < 25) return -(25 - age) * 1.0;
  if (age <= 30) return 0;
  if (age <= 34) return -(age - 30) * 1.3;
  return -4 * 1.3 - (age - 34) * 1.8;
}
/** 새 실력 */
function newOvr(S, age, league, clubAdj) {
  const x = peakOf(S) + ageAdj(age) + clubAdj;
  const pen = (1 - (LS[league] ?? 0.9)) * 30 * (1 - clamp((x - 70) / 25, 0, 1));   // 리그 수준: 일반 선수만
  return Math.round(clamp(x - pen, 40, 95));
}

/**
 * 실력 (v2): 지명도만이 아니라 실제로 뛴 기록으로 — 지명도가 낮아도 잘 뛰면 높게 (숨은 에이스)
 *  - 지명도 · 대표팀 (원래 공식의 재능 점수 S) ×0.3
 *  - 구단 수준 × 출전 비중: (구단 명성 − 70) × 0.30 × (0.4 + 0.6 × 주전도)   주전도 = 그 구단 기간 시즌당 리그 출전 ÷ 28
 *  - 주전 보너스: (주전도 − 0.5) × 6
 *  - 득점력 (그 구단에서 20경기 이상): 공격수 (경기당 골 − 0.30) × 15 (−3~+6) · 윙어 · 공격형 미드 (− 0.18) × 15 (−2~+4) · 중앙 미드 (− 0.08) × 12 (−1~+2)
 *  - 이후 경력: 3시즌 안에 더 큰 구단으로 갔으면 (명성 차 × 0.15, 최대 +5) — 2부 · 작은 구단의 숨은 에이스
 *  - 나이: 25세 미만 한 살마다 −0.9 · 30세 넘어 −1.2 · 34세 넘어 −0.6 더
 *  출전 기록이 없으면 주전도 0.6 · 득점력 0 으로 본다. 그 시즌 2군(II · B · 카스티야 등) 기간만 있으면 시즌당 2경기 (1군 명단에만 있던 선수)
 */
/** 그 시즌 기록 점수 (나이 보정 전) */
function seasonEvidence({ S, rep, stint, pos, futureRep }) {
  const r = stint?.perSeason != null ? clamp(stint.perSeason / 28, 0, 1) : 0.6;
  let x = 66 + 0.3 * S + (rep - 70) * 0.3 * (0.4 + 0.6 * r) + (r - 0.5) * 6;
  if (stint && (stint.apps ?? 0) >= 20 && stint.goals != null) {
    const gpa = stint.goals / stint.apps;
    if (pos === 'ST') x += clamp((gpa - 0.3) * 10, -2, 3);
    else if (['LW', 'RW', 'AM'].includes(pos)) x += clamp((gpa - 0.18) * 10, -1.5, 2.5);
    else if (['CM', 'LM', 'RM'].includes(pos)) x += clamp((gpa - 0.08) * 10, -1, 1.5);
  }
  if (futureRep > rep) x += clamp((futureRep - rep) * 0.15, 0, 5);
  return x;
}
/** 나이 보정: 25세 미만 한 살마다 −0.9 · 30세 넘어 −1.2 · 34세 넘어 −0.6 더. 30대에도 정상급 구단(명성 85+) 주전(시즌당 24경기+)이면 노쇠 감점 절반 (기량 유지가 기록으로 보임). 노쇠 감점은 최대 8 (유지면 4) */
const agePen = (age, keptUp = false) => (age < 25 ? -(25 - age) * 0.9 : 0) - (age > 30 ? Math.min(keptUp ? 4 : 8, ((age - 30) * 1.2 + Math.max(0, age - 34) * 0.6) * (keptUp ? 0.5 : 1)) : 0);   // 노쇠 감점은 최대 8 (기량 유지면 4)
/** 하위 호환 (한 시즌만 볼 때) */
const abilityOf = (a) => Math.round(clamp(seasonEvidence(a) + agePen(a.age), 40, 95));

function* clubFiles(root) {
  for (const s of fs.readdirSync(root).sort()) for (const lg of fs.readdirSync(path.join(root, s))) for (const f of fs.readdirSync(path.join(root, s, lg))) {
    if (!f.startsWith('_') && f.endsWith('.json')) yield { s, lg, file: path.join(root, s, lg, f), rel: path.join(s, lg, f) };
  }
}

function rebuild({ apply, log }) {
  // 선수마다 시즌별 주 포지션 (보조 포지션 보강용)
  const mains = new Map();
  const files = [...clubFiles(SEASONS)];
  const data = new Map();
  for (const x of files) {
    const c = JSON.parse(fs.readFileSync(x.file, 'utf8'));
    data.set(x.file, c);
    for (const p of c.squad) (mains.get(p.id) ?? mains.set(p.id, []).get(p.id)).push([+x.s.slice(0, 4), p.pos]);
  }
  // 리그 · 시즌별 구단 명성 중앙값
  const repMed = new Map();
  for (const x of files) { const c = data.get(x.file); const k = `${x.s}:${x.lg}`; (repMed.get(k) ?? repMed.set(k, []).get(k)).push(c.reputation ?? 70); }
  for (const [k, v] of repMed) { v.sort((a, b) => a - b); repMed.set(k, v[v.length >> 1]); }

  // 선수마다 시즌별 소속 구단 명성 (이후 경력용)
  const repByYear = new Map();
  for (const x of files) { const c = data.get(x.file); for (const p of c.squad) (repByYear.get(p.id) ?? repByYear.set(p.id, new Map()).get(p.id)).set(+x.s.slice(0, 4), c.reputation ?? 70); }
  // 위키백과 정보 상자의 구단별 출전 · 득점 (캐시)
  const car = careers();
  const clubLabel = JSON.parse(fs.readFileSync(path.join(ROOT, 'canonical', 'clubs.json'), 'utf8'));

  if (apply && !fs.existsSync(BAK)) { fs.cpSync(SEASONS, BAK, { recursive: true }); log(`백업: ${path.relative(process.cwd(), BAK)}`); }
  const rows = [];
  const st = { rows: 0, exact: 0, approx: 0, noOrig: 0, altAdded: 0, withApps: 0 };
  for (const x of files) {
    const c = data.get(x.file);
    const origFile = path.join(BEFORE, x.rel);
    const orig = fs.existsSync(origFile) ? Object.fromEntries(JSON.parse(fs.readFileSync(origFile, 'utf8')).squad.map((p) => [p.id, p])) : {};
    const clubAdj = clamp(((c.reputation ?? 70) - repMed.get(`${x.s}:${x.lg}`)) * 0.12, -3, 3);
    const year = +x.s.slice(0, 4);
    for (const p of c.squad) {
      st.rows++;
      const key = `${p.id}:${x.s}`;
      const age = year - +p.birth.slice(0, 4);
      const o = orig[p.id];
      const r = o ? recoverBase(o.attrs, o.pos, key) : (st.noOrig++, recoverBase(p.attrs, p.pos, key));
      r.exact ? st.exact++ : st.approx++;
      const S = talentOf(r.base, age, x.lg);
      // 그 시즌 그 구단에서의 출전 기록 (정보 상자)
      const cv = car[p.id];
      const sv = cv ? stintFor(cv, year, [clubLabel[c.club]?.label ?? '', c.club.replace(/-/g, ' ')]) : null;
      // 2군 기간만 있으면 1군 출전 거의 없음 (시즌당 2경기로 봄)
      const stint = sv?.reserve ? { perSeason: 2, apps: null, goals: null } : sv ? { ...sv, perSeason: sv.apps != null ? sv.apps / Math.max(1, Math.min(sv.to, 2026) - sv.from + (sv.to === sv.from ? 1 : 0)) : null } : null;
      if (stint?.perSeason != null) st.withApps++;
      let futureRep = 0;
      for (let yy = year + 1; yy <= year + 3; yy++) futureRep = Math.max(futureRep, repByYear.get(p.id)?.get(yy) ?? 0);
      const ev = seasonEvidence({ S, rep: c.reputation ?? 70, stint, pos: p.pos, futureRep });
      // 보조 포지션: 지금 것 + 앞뒤 3시즌 안에 주 포지션으로 뛴 자리 (같은 골키퍼/필드끼리, 최대 3개)
      const alt = [...(p.alt ?? [])];
      for (const [yy, pos] of (mains.get(p.id) ?? []).sort((a, b) => Math.abs(a[0] - year) - Math.abs(b[0] - year))) {
        if (alt.length >= 3) break;
        if (Math.abs(yy - year) <= 3 && pos !== p.pos && !alt.includes(pos) && (pos === 'GK') === (p.pos === 'GK')) { alt.push(pos); st.altAdded++; }
      }
      rows.push({ s: x.s, lg: x.lg, club: c.club, id: p.id, name: p.name, age, origPos: o?.pos ?? null, pos: p.pos, alt, base: Math.round(r.base), S: Math.round(S * 10) / 10, ev, rep: c.reputation ?? 70, score: 0, peak: 0, ovr: 0, exact: r.exact, apps: stint?.apps ?? null, perSeason: stint?.perSeason != null ? Math.round(stint.perSeason) : null, goals: stint?.goals ?? null, futureRep, _p: p, _key: key, _file: x.file });
    }
  }
  // 경력 전체 참고: 선수마다 기록 점수가 가장 좋은 3시즌 평균 = 전성기 실력. 시즌 점수 = 그 시즌 기록 절반 + 전성기 절반 + 나이 보정
  //  (나중에 스타가 된 선수는 젊을 때도 반영, 반짝 시즌은 조금 눌림. 2025-26 유망주처럼 기록이 적으면 그 시즌 기록 위주)
  const evs = new Map();
  for (const r of rows) (evs.get(r.id) ?? evs.set(r.id, []).get(r.id)).push(r.ev);
  const peakOfId = new Map([...evs].map(([id, xs]) => { const t = [...xs].sort((a, b) => b - a).slice(0, 3); return [id, t.reduce((a, b) => a + b, 0) / t.length]; }));
  for (const r of rows) { r.peak = Math.round(peakOfId.get(r.id) * 10) / 10; r.score = 0.5 * r.ev + 0.5 * r.peak + agePen(r.age, r.rep >= 85 && (r.perSeason ?? 0) >= 24); }
  // 시즌 · 포지션 묶음(GK · DF · MF · FW)마다 펼치기: 1부 리그 선수 점수 순위 → 목표 분포 (순서는 점수 그대로, 간격만).
  //  포지션 묶음마다 따로 해서 득점 기록이 있는 공격수만 높아지지 않게. 2부 · 그 밖은 같은 표로
  const TARGET = [[0, 50], [0.01, 55], [0.1, 62], [0.25, 66], [0.5, 71], [0.75, 76], [0.9, 81], [0.97, 85], [0.99, 88], [0.997, 91], [1, 94]];
  const bySeason = new Map();
  const GRP = { GK: 'GK', CB: 'DF', LB: 'DF', RB: 'DF', LWB: 'DF', RWB: 'DF', DM: 'MF', CM: 'MF', AM: 'MF', LM: 'MF', RM: 'MF', LW: 'FW', RW: 'FW', ST: 'FW' };
  const tkey = (r) => `${r.s}:${GRP[r.pos]}`;
  for (const r of rows) if (r.lg.endsWith('1')) (bySeason.get(tkey(r)) ?? bySeason.set(tkey(r), []).get(tkey(r))).push(r.score);
  const tables = new Map();
  for (const [s, xs] of bySeason) {
    xs.sort((a, b) => a - b);
    tables.set(s, TARGET.map(([q, t]) => [xs[Math.min(xs.length - 1, Math.floor(q * (xs.length - 1)))], t]));
  }
  const mapScore = (tab, v) => {
    if (v <= tab[0][0]) return tab[0][1] - (tab[0][0] - v);
    for (let i = 1; i < tab.length; i++) {
      const [x0, y0] = tab[i - 1], [x1, y1] = tab[i];
      if (v <= x1) return x1 === x0 ? y1 : y0 + ((v - x0) / (x1 - x0)) * (y1 - y0);
    }
    return tab.at(-1)[1] + (v - tab.at(-1)[0]) * 0.5;
  };
  for (const r of rows) r.ovr = Math.round(clamp(mapScore(tables.get(tkey(r)), r.score), 40, 95));
  if (apply) {
    for (const r of rows) {
      r._p.attrs = attrsFor(r.ovr, r._p.pos, r._key);
      if (r.alt.length) r._p.alt = r.alt; else delete r._p.alt;
    }
    for (const x of files) fs.writeFileSync(x.file, JSON.stringify(data.get(x.file), null, 2) + '\n');
  }
  for (const r of rows) { delete r._p; delete r._key; delete r._file; }
  const rep = path.join(ROOT, '_pipeline', 'reports', 'rebuild.json');
  fs.mkdirSync(path.dirname(rep), { recursive: true });
  fs.writeFileSync(rep, JSON.stringify(rows));
  log(`선수 · 시즌 ${st.rows}줄 · 원래 실력 정확 ${st.exact} · 근사 ${st.approx} (원본 없음 ${st.noOrig}) · 출전 기록 있음 ${st.withApps} · 보조 포지션 보강 ${st.altAdded}`);
  log(`목록: ${path.relative(process.cwd(), rep)}${apply ? ' · 적용함' : ' · 점검만 (--apply 로 적용)'}`);
  return rows;
}

module.exports = { rebuild, newOvr, abilityOf, peakOf, ageAdj, talentOf };
