// 선수 사진 직접 모으기용 (개인 PC 전용, data/photos 는 Git 제외)
//
//  1) 선수 ID 목록 내보내기 → 다른 사람 · AI 에게 넘길 CSV
//     node tools/data_pipeline photos-ids [--season 2025-26] [--league eng1] [--club liverpool]
//     → data/photos/ids/<시즌>[-리그][-구단].csv  (엑셀에서 바로 열림)
//       열: 선수ID, 한글 이름, 영문 이름, 생년월일, 국적, 구단ID, 구단, 리그, 시즌, 사진 있음, 넣을 파일 이름
//
//  2) 사진 가져오기: data/photos/inbox/<선수ID>/<시즌>.jpg (png · webp 도 됨) 를 넣고
//     node tools/data_pipeline photos-import
//     - 파일 형식 (JPG · PNG · WEBP) · 크기 (15MB 이하 · 가로 300px 이상) 검사
//     - 얼굴 위치 자동 (가장 큰 얼굴, tools 에서 npm i 했으면) → 작은 칸을 얼굴에 맞춰 자름
//     - manifest.json 에 넣고 직접 고른 사진으로 표시 (자동 수집이 덮어쓰지 않음)
//     - 같은 폴더에 <시즌>.txt 가 있으면 첫 줄을 출처 · 메모로 기록
//     - 가져온 파일은 inbox/_imported/ 로 옮김. 잘못된 파일 · 없는 선수 ID 는 목록으로 알려 줌
//     선수ID 는 실명 데이터 ID (예: mohamed-salah-1992). 공개 데이터 ID (p로 시작) 를 써도 된다
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA } = require('../config');
const { readJson } = require('../lib/util');

const OUT = path.join(DATA, 'photos');
const INBOX = path.join(OUT, 'inbox');
const MAX = 15 * 1024 * 1024;

function imageInfo(b) {
  if (b[0] === 0xff && b[1] === 0xd8) {
    // JPEG: SOF 마커에서 크기
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { ext: 'jpg', h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      i += 2 + b.readUInt16BE(i + 2);
    }
    return { ext: 'jpg', w: 0, h: 0 };
  }
  if (b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP') {
    const kind = b.slice(12, 16).toString();
    if (kind === 'VP8X') return { ext: 'webp', w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    if (kind === 'VP8 ') return { ext: 'webp', w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L') { const v = b.readUInt32LE(21); return { ext: 'webp', w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
    return { ext: 'webp', w: 0, h: 0 };
  }
  return null;
}

/** 선수 목록 (실명 데이터) */
function rosterRows({ season, league, club }) {
  const root = path.join(DATA, 'seasons');
  const seasons = fs.readdirSync(root).sort();
  const s = season ?? seasons[seasons.length - 1];
  if (!fs.existsSync(path.join(root, s))) throw new Error(`시즌 데이터 없음: ${s}`);
  const ko = {};
  const lk = path.join(DATA, 'locale', 'ko');
  if (fs.existsSync(lk)) for (const f of fs.readdirSync(lk).filter((f) => /^players.*\.json$/.test(f))) Object.assign(ko, readJson(path.join(lk, f)));
  const clubKo = (id) => { const f = path.join(DATA, 'clubs', `${id}.json`); return fs.existsSync(f) ? readJson(f).ko ?? id : id; };
  const rows = [];
  for (const lg of fs.readdirSync(path.join(root, s))) {
    if (league && lg !== league) continue;
    for (const f of fs.readdirSync(path.join(root, s, lg))) {
      if (f.startsWith('_') || (club && f !== `${club}.json`)) continue;
      const d = readJson(path.join(root, s, lg, f));
      for (const p of d.squad ?? []) rows.push({ id: p.id, ko: ko[p.id]?.name ?? '', name: p.name, birth: p.birth ?? '', nation: p.nation ?? '', club: d.club, clubKo: clubKo(d.club), league: lg, season: s });
    }
  }
  return { season: s, rows };
}

async function photoIds({ season, league, club, log }) {
  const { season: s, rows } = rosterRows({ season, league, club });
  const mf = fs.existsSync(path.join(OUT, 'manifest.json')) ? readJson(path.join(OUT, 'manifest.json')) : { players: {} };
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const head = ['선수ID', '한글 이름', '영문 이름', '생년월일', '국적', '구단ID', '구단', '리그', '시즌', '사진 있음', '넣을 파일 이름'];
  const lines = [head.join(','), ...rows.map((r) => [r.id, r.ko, r.name, r.birth, r.nation, r.club, r.clubKo, r.league, r.season, mf.players[r.id]?.seasons?.[r.season] ? 'O' : '', `inbox/${r.id}/${r.season}.jpg`].map(q).join(','))];
  const dir = path.join(OUT, 'ids');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${[s, league, club].filter(Boolean).join('-')}.csv`);
  fs.writeFileSync(file, '﻿' + lines.join('\r\n') + '\r\n');   // BOM: 엑셀에서 한글이 깨지지 않게
  log(`  선수 ${rows.length}명 → ${path.relative(path.join(DATA, '..'), file)}`);
  log('  사진은 data/photos/inbox/<선수ID>/<시즌>.jpg 로 넣고 photos-import 를 실행하세요');
}

async function photoImport({ log }) {
  log('\n■ 선수 사진 가져오기 (data/photos/inbox)');
  if (!fs.existsSync(INBOX)) { fs.mkdirSync(INBOX, { recursive: true }); log('  inbox 폴더를 만들었습니다. <선수ID>/<시즌>.jpg 로 넣고 다시 실행하세요'); return; }
  const canon = readJson(path.join(DATA, 'canonical', 'players.json'));
  const pub = fs.existsSync(path.join(DATA, 'canonical', 'public-map.json')) ? readJson(path.join(DATA, 'canonical', 'public-map.json')).players : {};
  const fromPublic = new Map(Object.entries(pub).map(([real, p]) => [p, real]));
  const mfFile = path.join(OUT, 'manifest.json');
  const mf = fs.existsSync(mfFile) ? readJson(mfFile) : { players: {}, files: {} };
  let az = null;
  try { az = await require('../lib/faces').openAnalyzer(); } catch { log('  (얼굴 분석 도구가 없어 얼굴 위치 없이 넣습니다 — tools 폴더에서 npm i)'); }
  const done = path.join(INBOX, '_imported');
  const ok = [], bad = [];
  for (const dir of fs.readdirSync(INBOX)) {
    if (dir.startsWith('_')) continue;
    const full = path.join(INBOX, dir);
    if (!fs.statSync(full).isDirectory()) { bad.push(`${dir}: 폴더가 아닙니다 (inbox/<선수ID>/<시즌>.jpg 형식)`); continue; }
    const id = canon[dir] ? dir : fromPublic.get(dir);
    if (!id) { bad.push(`${dir}: 없는 선수 ID`); continue; }
    for (const f of fs.readdirSync(full)) {
      const m = f.match(/^(\d{4}-\d{2})\.(jpe?g|png|webp)$/i);
      if (!m) { if (!/\.txt$/i.test(f)) bad.push(`${dir}/${f}: 파일 이름은 <시즌>.jpg (예: 2025-26.jpg)`); continue; }
      const season = m[1];
      const b = fs.readFileSync(path.join(full, f));
      if (b.length > MAX) { bad.push(`${dir}/${f}: 15MB 넘음`); continue; }
      const info = imageInfo(b);
      if (!info) { bad.push(`${dir}/${f}: 그림 파일이 아님 (JPG · PNG · WEBP)`); continue; }
      if (info.w && info.w < 300) { bad.push(`${dir}/${f}: 너무 작음 (가로 ${info.w}px, 300px 이상)`); continue; }
      let face, w = info.w, h = info.h;
      if (az) {
        const r = await az.analyze(b).catch(() => null);
        if (r) { w = r.w; h = r.h; const big = [...r.faces].sort((x, y) => y.px - x.px)[0]; if (big) face = big.box.map((v) => Math.round(v * 1e4) / 1e4); }
      }
      const key = 'u' + crypto.createHash('sha1').update(b).digest('hex').slice(0, 15);
      fs.mkdirSync(path.join(OUT, 'files'), { recursive: true });
      fs.writeFileSync(path.join(OUT, 'files', `${key}.${info.ext}`), b);
      const note = fs.existsSync(path.join(full, `${season}.txt`)) ? fs.readFileSync(path.join(full, `${season}.txt`), 'utf8').split(/\r?\n/)[0].trim() : '';
      mf.files[key] = { title: '직접 넣은 사진', author: '', license: '', date: null, url: /^https?:\/\//.test(note) ? note : '', note: note || undefined, user: true, ext: info.ext, w, h, face };
      const e = (mf.players[id] ??= { seasons: {} });
      e.seasons[season] = key;
      (e.picked ??= {})[season] = true;
      ok.push(`${id} ${season}${face ? '' : ' (얼굴 못 찾음)'}`);
      fs.mkdirSync(path.join(done, dir), { recursive: true });
      fs.renameSync(path.join(full, f), path.join(done, dir, f));
      if (fs.existsSync(path.join(full, `${season}.txt`))) fs.renameSync(path.join(full, `${season}.txt`), path.join(done, dir, `${season}.txt`));
    }
    if (!fs.readdirSync(full).length) fs.rmdirSync(full);
  }
  if (az) await az.close();
  fs.writeFileSync(mfFile, JSON.stringify(mf));
  log(`  가져옴 ${ok.length}장 · 문제 ${bad.length}건`);
  for (const x of ok.slice(0, 20)) log(`  + ${x}`);
  if (ok.length > 20) log(`  … 외 ${ok.length - 20}장`);
  for (const x of bad) log(`  ! ${x}`);
  if (ok.length) log('  게임 화면을 새로 고치면 바로 보입니다 (이미 넣은 시즌 사진은 새 파일로 바뀜)');
}

module.exports = { photoIds, photoImport };
