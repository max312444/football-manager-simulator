// 선수 사진 (개인 PC 보관용, Git 에 올리지 않음): 위키미디어 공용 (자유 라이선스) 에서 시즌별로 고른다
//  1) 위키데이터: 대표 사진 (P18) · 공용 분류 (P373)
//  2) 공용 분류의 사진 목록 + 촬영 날짜 · 작가 · 라이선스
//  3) 시즌마다 (7월 1일 ~ 다음 해 6월 30일 촬영) 이름이 들어 있고 세로로 긴 사진을 고른다. 없으면 그 시즌은 비움 (게임이 이전 시즌 사진 → 대표 사진 순으로 씀)
//  → data/photos/files/{해시}.jpg (가로 320px) · data/photos/manifest.json (선수 · 시즌 → 파일, 파일 → 출처 · 작가 · 라이선스)
//  node tools/data_pipeline photos [--club liverpool] [--season 2025-26] [--league eng1,esp1,ita1,ger1,fra1] [--limit 100]
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA, USER_AGENT } = require('../config');
const { readJson, normName } = require('../lib/util');
const { getJson } = require('../lib/http');
const { sparql } = require('../providers/wikidata');
const { openAnalyzer, faceDist, referenceFace } = require('../lib/faces');

const OUT = path.join(DATA, 'photos');
const COMMONS = 'https://commons.wikimedia.org/w/api.php?format=json&formatversion=2';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (html) => String(html ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

/** 데이터에 나오는 선수 → 시즌 목록 · 이름 */
function appearances({ club, season, leagues }) {
  const out = new Map();
  const root = path.join(DATA, 'seasons');
  for (const s of fs.readdirSync(root)) {
    if (season && s !== season) continue;
    for (const lg of fs.readdirSync(path.join(root, s))) {
      if (leagues && !leagues.includes(lg)) continue;
      for (const f of fs.readdirSync(path.join(root, s, lg))) {
        if (f.startsWith('_') || !f.endsWith('.json')) continue;
        if (club && f !== `${club}.json`) continue;
        const d = readJson(path.join(root, s, lg, f));
        for (const p of d.squad ?? []) {
          const e = out.get(p.id) ?? { name: p.name, birth: p.birth, seasons: new Set(), clubs: {} };
          e.seasons.add(s);
          e.clubs[s] = d.club ?? f.slice(0, -5);
          out.set(p.id, e);
        }
      }
    }
  }
  return out;
}

/** 시즌 기간 */
const seasonWindow = (s) => [`${s.slice(0, 4)}-07-01`, `${+s.slice(0, 4) + 1}-06-30`];

function photoDate(meta) {
  const raw = strip(meta?.DateTimeOriginal?.value ?? meta?.DateTime?.value ?? '');
  const m = raw.match(/(\d{4})[-:](\d{2})[-:](\d{2})/) ?? raw.match(/(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3] ?? '15'}` : null;
}

async function download(url, file) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await sleep(300);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(60_000) });
      if (res.status === 429 || res.status >= 500) { await sleep(3000 * 2 ** attempt); continue; }
      if (!res.ok) return false;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      return true;
    } catch { await sleep(3000 * 2 ** attempt); }
  }
  return false;
}

async function photos({ club, season, league, limit, log }) {
  const leagues = league ? league.split(',').map((x) => x.trim()).filter(Boolean) : undefined;   // --league eng1,esp1 (여러 개는 쉼표)
  log(`\n■ 선수 사진 (위키미디어 공용 · 개인 보관용)${club ? ` · ${club}` : ''}${season ? ` · ${season}` : ''}`);
  const qids = readJson(path.join(DATA, 'canonical', 'players.json'));
  const apps = appearances({ club, season, leagues });
  let ids = [...apps.keys()].filter((id) => qids[id]?.wikidata);
  if (limit) ids = ids.slice(0, limit);
  log(`  대상 선수 ${ids.length}명`);

  const manifestFile = path.join(OUT, 'manifest.json');
  const manifest = fs.existsSync(manifestFile) ? readJson(manifestFile) : { players: {}, files: {} };
  // 저장: 다른 창(동시에 돌리는 수집 · 게임에서 고른 사진)이 바꾼 내용을 지우지 않게 디스크의 최신 목록과 합쳐서 저장
  const save = () => {
    fs.mkdirSync(OUT, { recursive: true });
    const disk = fs.existsSync(manifestFile) ? readJson(manifestFile) : { players: {}, files: {} };
    for (const [k, v] of Object.entries(manifest.files)) disk.files[k] ??= v;
    for (const [id, e] of Object.entries(manifest.players)) {
      const d = (disk.players[id] ??= { seasons: {} });
      for (const [s, k] of Object.entries(e.seasons ?? {})) if (!d.picked?.[s] && !d.seasons[s]) d.seasons[s] = k;   // 이미 있는 (직접 고른 · 다른 창이 찾은) 사진은 그대로
      if (e.cands) d.cands = { ...e.cands, ...(d.cands ?? {}) };
      if (!d.default && e.default) d.default = e.default;
    }
    const tmp = manifestFile + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(disk));
    fs.renameSync(tmp, manifestFile);
    Object.assign(manifest, disk);
  };

  // 1) 위키데이터: 대표 사진 · 공용 분류 (200명씩)
  const info = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const byQ = new Map(chunk.map((id) => [qids[id].wikidata, id]));
    const rows = await sparql(`SELECT ?p ?img ?cat WHERE { VALUES ?p { ${[...byQ.keys()].map((q) => `wd:${q}`).join(' ')} } OPTIONAL { ?p wdt:P18 ?img } OPTIONAL { ?p wdt:P373 ?cat } }`);
    for (const r of rows) {
      const id = byQ.get(r.p.value.split('/').pop());
      const e = info.get(id) ?? { imgs: new Set(), cat: null };
      if (r.img) e.imgs.add(decodeURIComponent(r.img.value.split('/').pop()).replace(/_/g, ' '));
      if (r.cat) e.cat = r.cat.value;
      info.set(id, e);
    }
    log(`  위키데이터 ${Math.min(ids.length, i + 200)}/${ids.length}`);
  }

  // 2) 공용: 분류 사진 (+ 연도 · 구단 하위 분류) + 대표 사진의 정보 · 분류 이름
  const query = async (params) => {
    const pages = new Map();
    let cont = '';
    for (let i = 0; i < 12; i++) {
      const j = await getJson('commons', `${COMMONS}&action=query&prop=imageinfo|categories&iiprop=url|size|extmetadata|mime&iiurlwidth=640&iiextmetadatafilter=DateTimeOriginal|DateTime|Artist|LicenseShortName&cllimit=max&clshow=!hidden&${params}${cont}`);
      for (const p of j.query?.pages ?? []) {
        const t = p.title.replace(/^File:/, '');
        const cur = pages.get(t) ?? { title: t, cats: [] };
        if (p.imageinfo?.[0]) Object.assign(cur, p.imageinfo[0]);
        for (const c of p.categories ?? []) cur.cats.push(c.title.replace(/^Category:/, ''));
        pages.set(t, cur);
      }
      if (!j.continue) break;
      cont = '&' + new URLSearchParams(j.continue).toString();
    }
    return [...pages.values()].filter((p) => p.thumburl);
  };
  const subcats = async (cat) => {
    const j = await getJson('commons', `${COMMONS}&action=query&list=categorymembers&cmtype=subcat&cmlimit=200&cmtitle=${encodeURIComponent('Category:' + cat)}`);
    return (j.query?.categorymembers ?? []).map((c) => c.title.replace(/^Category:/, ''));
  };
  // 구단 이름 (사진 설명 · 분류에서 찾을 말)
  const GENERIC = new Set(['fc', 'f', 'c', 'afc', 'cf', 'sc', 'ac', 'as', 'ss', 'ssc', 'us', 'club', 'football', 'calcio', 'de', 'cd', 'ud', 'sd', 'rc', 'ca', 'sv', 'vfl', 'vfb', 'tsg', 'bv', 'og', 'sco', 'stade', 'olympique', 'association', 'sportive', 'clube', '1', '04', '05', '1899', '1846', '1860', '1900', '1907', '1909', '1910']);
  const clubWords = new Map();
  const clubTokens = (clubId) => {
    if (clubWords.has(clubId)) return clubWords.get(clubId);
    const f = path.join(DATA, 'clubs', `${clubId}.json`);
    const m = fs.existsSync(f) ? readJson(f) : { name: clubId.replace(/-\d$/, '').replace(/-/g, ' ') };
    const phrase = normName(m.name).split(' ').filter((w) => !GENERIC.has(w)).join(' ');
    const out = [...new Set([phrase, normName(m.name)].filter((x) => x.length >= 3))];
    clubWords.set(clubId, out);
    return out;
  };
  /** 위키 문서에 쓰인 횟수 (유명한 사진일수록 많다) */
  const usage = async (titles) => {
    const out = new Map();
    for (let i = 0; i < titles.length; i += 20) {
      const chunk = titles.slice(i, i + 20);
      let cont = '';
      for (let k = 0; k < 6; k++) {
        const j = await getJson('commons', `${COMMONS}&action=query&prop=globalusage&gulimit=max&gufilterlocal=1&titles=${chunk.map((t) => encodeURIComponent('File:' + t)).join('|')}${cont}`);
        for (const p of j.query?.pages ?? []) { const t = p.title.replace(/^File:/, ''); out.set(t, (out.get(t) ?? 0) + (p.globalusage?.filter((u) => u.ns === '0' || u.ns === 0).length ?? 0)); }
        if (!j.continue) break;
        cont = '&' + new URLSearchParams(j.continue).toString();
      }
    }
    return out;
  };
  const MATCH = /\b(vs|v|versus|against|match|game|derby|final|league|premier|liga|laliga|serie|bundesliga|ligue|cup|uefa|champions|europa|conference|copa|coppa|pokal|coupe)\b/;
  const NATIONAL = /\b(national|world cup|euro 20\d\d|nations league|copa america|africa cup|asian cup|gold cup|olympic|qualif|u 21|u21|u 23|u23)\b/;
  const BAD = /\b(bus|arrival|arriving|arrives|training|warm ?up|warming|airport|hotel|fans|signing|press|conference|parade|celebration parade|ceremony|gala|award|portrait session|autograph)\b/;

  let done = 0, withPhoto = 0, seasonsFilled = 0, files = 0;
  // 얼굴 분석기 (처음 필요할 때 크롬을 띄운다)
  let az = null;
  const analyzer = () => (az ??= openAnalyzer());
  for (const id of ids) {
    const e = info.get(id);
    done++;
    if (!e || (!e.imgs.size && !e.cat)) continue;
    const a0 = apps.get(id);
    const years = new Set([...a0.seasons].flatMap((s) => [s.slice(0, 4), String(+s.slice(0, 4) + 1)]));
    const cands = [];
    try {
      if (e.cat) {
        cands.push(...await query(`generator=categorymembers&gcmtype=file&gcmlimit=100&gcmtitle=${encodeURIComponent('Category:' + e.cat)}`));
        // 연도별 하위 분류 ("Mohamed Salah in 2025") · 구단별 하위 분류 ("Mohamed Salah with Liverpool F.C.")
        const subs = (await subcats(e.cat)).filter((c) => { const y = c.match(/\b(19|20)\d\d\b/)?.[0]; return y ? years.has(y) : /\bwith\b|\bat\b/i.test(c); }).slice(0, 10);
        for (const c of subs) cands.push(...await query(`generator=categorymembers&gcmtype=file&gcmlimit=100&gcmtitle=${encodeURIComponent('Category:' + c)}`));
      }
      if (e.imgs.size) cands.push(...await query(`titles=${[...e.imgs].map((t) => encodeURIComponent('File:' + t)).join('|')}`));
    } catch (err) { log(`  ! ${id}: ${err.message.slice(0, 120)}`); continue; }
    const seen = new Set();
    // 선수가 15세 되기 전 날짜의 자료는 뺀다 (그림 · 다른 사람 사진). 분류 사진은 촬영 날짜가 있어야 한다
    const minDate = a0.birth ? `${+a0.birth.slice(0, 4) + 15}${a0.birth.slice(4)}` : '0';
    const pool = cands.filter((c) => /jpe?g|png/.test(c.mime) && !seen.has(c.title) && seen.add(c.title)
      && (e.imgs.has(c.title) ? (photoDate(c.extmetadata) ?? '9999') >= minDate : (photoDate(c.extmetadata) ?? '0') >= minDate));
    if (!pool.length) continue;
    const surname = normName(a0.name).split(' ').filter((w) => w.length > 2).pop() ?? '';
    /** 점수: 그 시즌 구단 경기 사진 > 유명한 사진 (대표 사진 · 얼굴을 잘라 둔 cropped). 대표팀 · 버스 · 훈련 사진은 깎는다 */
    const score = (c, clubId) => {
      const text = normName(`${c.title} ${c.cats.join(' ')}`);
      const raw = `${c.title} ${c.cats.join(' ')}`.toLowerCase();
      const club = clubId && clubTokens(clubId).some((t) => text.includes(t));
      let s = 0;
      if (club) s += 4;
      if (MATCH.test(text)) s += 2;
      if (/crop/.test(raw)) s += 3;
      if (/wikiportraits/.test(raw)) s += 2;   // 얼굴 촬영 (WikiPortraits)
      if (e.imgs.has(c.title)) s += 3;
      if (NATIONAL.test(text)) s -= 3;
      if (BAD.test(text)) s -= 2;
      if (c.height >= c.width) s += 1;
      if (surname && normName(c.title).includes(surname)) s += 1;
      if (c.width < 300) s -= 4; else if (c.width < 500) s -= 1;   // 너무 작은 사진 (확대해서 봄)
      return s;
    };
    const hashOf = (c) => crypto.createHash('sha1').update(c.title).digest('hex').slice(0, 16);
    /** 사진 받기 (files/ 에 저장) */
    const fetchFile = async (c) => {
      const key = hashOf(c);
      const file = path.join(OUT, 'files', `${key}.jpg`);
      if (!fs.existsSync(file)) { if (!(await download(c.thumburl, file))) return null; files++; }
      return { key, file };
    };
    /** 얼굴 분석 (결과는 _faces/ 에 저장해 다시 쓰지 않음) */
    const facesOf = async (c) => {
      const f = await fetchFile(c);
      if (!f) return null;
      const cache = path.join(OUT, '_faces', `${f.key}.json`);
      if (fs.existsSync(cache)) return { ...f, ...readJson(cache) };
      const r = await analyzer().then((a) => a.analyze(fs.readFileSync(f.file))).catch(() => null);
      if (!r) return null;
      fs.mkdirSync(path.dirname(cache), { recursive: true });
      fs.writeFileSync(cache, JSON.stringify(r));
      return { ...f, ...r };
    };
    const record = (c, key, an, face) => {
      manifest.files[key] = { title: c.title, author: strip(c.extmetadata?.Artist?.value).slice(0, 120), license: strip(c.extmetadata?.LicenseShortName?.value), date: photoDate(c.extmetadata), url: c.descriptionurl,
        ...(an ? { w: an.w, h: an.h } : {}), ...(face ? { face: face.box.map((v) => Math.round(v * 1e4) / 1e4) } : {}) };
    };
    const entry = manifest.players[id] ?? { seasons: {} };

    // 기준 얼굴: 대표 사진 + 이 선수 혼자 나온 사진 (얼굴이 하나뿐인 것) 의 얼굴 특징값
    const solo = pool.filter((c) => e.imgs.has(c.title) || (normName(c.title).includes(surname) && !/\band\b|,|\bvs?\b/i.test(c.title.replace(/\(.*?\)/g, ''))))
      .sort((x, y) => (e.imgs.has(y.title) ? 1 : 0) - (e.imgs.has(x.title) ? 1 : 0)).slice(0, 8);
    const refDescs = [];
    for (const c of solo) { const an = await facesOf(c); if (an?.faces.length === 1 && an.faces[0].px >= 60) refDescs.push(an.faces[0].desc); }
    const ref = referenceFace(refDescs);

    /** 사진에서 이 선수 얼굴 (기준 얼굴과 가장 가까운 얼굴, 기준이 없으면 얼굴이 하나뿐일 때만) */
    const playerFace = (an) => {
      if (!an?.faces.length) return null;
      if (ref) { const best = an.faces.map((f) => ({ f, d: faceDist(f.desc, ref) })).sort((x, y) => x.d - y.d)[0]; return best.d < 0.55 ? { ...best.f, dist: best.d } : null; }
      return an.faces.length === 1 ? an.faces[0] : null;
    };

    // 대표 사진 (시즌 사진이 없을 때 참고용)
    const def = pool.filter((c) => e.imgs.has(c.title))[0];
    if (!entry.default && def) { const an = await facesOf(def); if (an) { record(def, an.key, an, playerFace(an)); entry.default = an.key; } }

    // 시즌별: 그 시즌에 찍힌 사진 중 이 선수 얼굴이 크고 선명한 사진. 기본 점수 (그 시즌 구단 경기 사진 · 유명한 사진) 를 더한다
    for (const s of a0.seasons) {
      if (entry.picked?.[s]) continue;   // 직접 고른 사진은 그대로
      if (entry.seasons[s] && !process.env.PHOTO_REDO) continue;   // 이미 찾은 시즌은 건너뜀 (중간에 멈춰도 이어서) · 다시 고르려면 PHOTO_REDO=1
      const [a, b] = seasonWindow(s);
      const inSeason = pool.filter((c) => { const d = photoDate(c.extmetadata); return d && d >= a && d <= b; })
        .map((c) => ({ c, sc: score(c, a0.clubs[s]) })).sort((x, y) => y.sc - x.sc).slice(0, 8);   // 후보 8장까지만 받아 얼굴 분석 (속도)
      const ok = [];
      for (const x of inSeason) {
        const an = await facesOf(x.c);
        const face = playerFace(an);
        if (!face) continue;
        x.an = an; x.face = face;
        x.faceSc = Math.min(4, face.px / 60) + Math.min(4, face.sharp / 250);
        // 얼굴이 너무 작거나 흐리면 뺀다
        if (face.px >= 70 && face.sharp >= 150) ok.push(x);
      }
      ok.sort((x, y) => (y.sc + y.faceSc) - (x.sc + x.faceSc));
      if (process.env.PHOTO_DEBUG) for (const x of ok.slice(0, 5)) log(`    [${id} ${s}] ${(x.sc + x.faceSc).toFixed(1)} (기본 ${x.sc} · 얼굴 ${x.face.px}px · 선명 ${x.face.sharp}${x.face.dist != null ? ` · 거리 ${x.face.dist.toFixed(2)}` : ''}) ${x.c.title}`);
      if (!ok.length) { delete entry.seasons[s]; if (entry.cands) delete entry.cands[s]; continue; }
      // 게임에서 직접 고를 수 있는 후보 (얼굴 · 선명도 기준을 통과한 사진만, 최대 8장)
      (entry.cands ??= {})[s] = ok.slice(0, 8).map(({ c, an, face }) => ({ title: c.title, src: c.thumburl, author: strip(c.extmetadata?.Artist?.value).slice(0, 120), license: strip(c.extmetadata?.LicenseShortName?.value), date: photoDate(c.extmetadata), url: c.descriptionurl, w: an.w, h: an.h, face: face.box.map((v) => Math.round(v * 1e4) / 1e4) }));
      const best = ok[0];
      record(best.c, best.an.key, best.an, best.face);
      entry.seasons[s] = best.an.key;
      seasonsFilled++;
    }
    if (entry.default || Object.keys(entry.seasons).length) { manifest.players[id] = entry; withPhoto++; }
    if (done % 50 === 0) { save(); log(`  ${done}/${ids.length} · 사진 있는 선수 ${withPhoto} · 시즌 사진 ${seasonsFilled} · 받은 파일 ${files}`); }
  }
  save();
  if (az) await (await az).close();
  log(`  끝: ${ids.length}명 중 사진 있는 선수 ${withPhoto} · 시즌 사진 ${seasonsFilled} · 새로 받은 파일 ${files}`);
}

module.exports = { photos };
