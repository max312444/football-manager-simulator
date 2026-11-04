// 데이터 파이프라인 공통 설정
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DATA = path.join(ROOT, 'data');

module.exports = {
  ROOT,
  DATA,
  SEASONS_DIR: path.join(DATA, 'seasons'),
  CLUBS_DIR: path.join(DATA, 'clubs'),
  CANONICAL_DIR: path.join(DATA, 'canonical'),      // 외부 ID 매핑 (Git에 남길 결과물)
  PIPELINE_DIR: path.join(DATA, '_pipeline'),        // 수집 결과·보고서 (재생성 가능)
  CACHE_DIR: path.join(DATA, '_pipeline', 'cache'),  // 제공자 응답 원본 캐시

  USER_AGENT: 'football-manager-data-pipeline/0.1 (personal non-commercial project; Node.js fetch)',

  // 제공자별 요청 간격(ms)과 캐시 유효 기간(일)
  PROVIDERS: {
    wikidata: { minIntervalMs: 1100, ttlDays: 30 },
    wikidataApi: { minIntervalMs: 300, ttlDays: 90 },
    // 과거 판(revision)은 바뀌지 않으므로 캐시를 오래 둔다
    wikipedia: { minIntervalMs: 300, ttlDays: 3650 },
  },
  MAX_RETRIES: 5,

  // 선수단 기준일: 여름 이적시장 마감 직후 (DATA_GUIDE.md 작성 규칙과 같음)
  snapshotDate(season) {
    if (season === '2020-21') return '2020-10-06';
    return `${season.slice(0, 4)}-09-01`;
  },

  // 출처로 새로 구축하는 리그 (Wikidata 리그 항목)
  LEAGUES: {
    eng1: { wikidata: 'Q9448', nation: 'ENG', level: 1 },
    esp1: { wikidata: 'Q324867', nation: 'ESP', level: 1 },
    ita1: { wikidata: 'Q15804', nation: 'ITA', level: 1 },
    ger1: { wikidata: 'Q82595', nation: 'GER', level: 1 },
    fra1: { wikidata: 'Q13394', nation: 'FRA', level: 1 },
  },
  FIRST_SEASON: 2000,
  LAST_SEASON: 2025,

  // 구단 국가 코드 → Wikidata 국가 항목 (구단 매핑 확인용)
  NATION_TO_COUNTRY_QIDS: {
    ENG: ['Q145', 'Q21'], WAL: ['Q145', 'Q25'], SCO: ['Q145', 'Q22'], NIR: ['Q145', 'Q26'],
    ESP: ['Q29'], GER: ['Q183'], ITA: ['Q38'], FRA: ['Q142'], MON: ['Q235'],
  },
};
