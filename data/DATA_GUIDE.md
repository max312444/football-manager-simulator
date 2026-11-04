# 데이터 작성 가이드

게임에 들어가는 모든 리그·구단·선수 데이터의 형식과 작성 규칙.
사람이 쓰든 AI가 쓰든 이 문서를 기준으로 작성하고, `node tools/validate.js`로 검사한다.

## 폴더 구조

```
data/
├── meta/
│   ├── nations.json        국가 코드 · 이름 · 지역 그룹(페이스온용)
│   └── leagues.json        리그 목록 · 등급(A/B/C) · 부(1부/2부)
├── clubs/                  구단 마스터 (시즌과 무관한 정보, 구단당 파일 1개)
│   └── arsenal.json
└── seasons/
    └── 2025-26/
        └── eng1/           리그 ID
            ├── _league.json    이 시즌 리그 정보 (참가 구단 목록 · 최종 순위)
            └── arsenal.json    구단 시즌 파일 (재정 + 선수단)
```

## 구단 마스터 (`clubs/<id>.json`)

이미 파일이 있으면 새로 만들지 않는다 (다른 시즌 작업에서 먼저 만들었을 수 있음).

```jsonc
{
  "id": "arsenal",
  "name": "Arsenal",              // 영문 통칭
  "ko": "아스널",                  // 한국어 표기
  "short": "ARS",                 // 3글자 약칭
  "nation": "ENG",
  "city": "London",
  "founded": 1886,
  "kits": {
    "home": { "primary": "#EF0107", "secondary": "#FFFFFF", "pattern": "sleeves" },
    "away": { "primary": "#FFFFFF", "secondary": "#063672", "pattern": "solid" }
  },
  "rivals": ["tottenham", "chelsea"]
}
```
`pattern`: `solid` `stripes`(세로 줄) `hoops`(가로 줄) `halves` `sash`(사선 띠) `sleeves`(소매만 다른 색)

## 리그 시즌 파일 (`_league.json`)

```jsonc
{
  "season": "2025-26",
  "league": "eng1",
  "clubs": ["arsenal", "aston-villa", "..."],       // 참가 구단 전체
  "standings": ["liverpool", "arsenal", "..."]      // 실제 최종 순위 (1위부터). 시즌이 끝나지 않았으면 생략
}
```

- 작업 단위는 **구단 시즌 파일 1개** (= 한 구단의 한 시즌).
- 선수의 고정 정보(이름·생일·국적·외형)는 구단 시즌 파일 안에 함께 적는다.
  같은 선수가 여러 시즌·구단에 나오면 **같은 `id`** 를 쓰고, 고정 정보도 똑같이 적는다.
  검사 스크립트가 시즌 간 불일치를 잡아낸다.
- 선수의 데뷔 시즌·데뷔 구단은 따로 적지 않는다. 데이터에 처음 등장하는 시즌이 곧 데뷔다.

## ID 규칙

| 대상 | 규칙 | 예 |
|---|---|---|
| 선수 | **영문 위키백과 문서 제목**(괄호 설명 제외)을 소문자·하이픈으로 + 출생연도. 악센트 제거, `ø→o` `æ→ae` `ß→ss` | `martin-odegaard-1998`, `gabriel-magalhaes-1997`, `lauren-1977` |
| 동명이인 | 출생연도까지 같으면 끝에 `-2` | `david-silva-1986-2` |
| 구단 | 영문 통칭 소문자 하이픈 | `arsenal`, `man-utd`, `man-city`, `tottenham`, `wolves`, `real-madrid` |

**잉글랜드 구단 ID (고정)**: `arsenal` `aston-villa` `birmingham` `blackburn` `blackpool` `bolton` `bournemouth` `bradford` `brentford` `brighton` `burnley` `cardiff` `charlton` `chelsea` `coventry` `crystal-palace` `derby` `everton` `fulham` `huddersfield` `hull` `ipswich` `leeds` `leicester` `liverpool` `luton` `man-city` `man-utd` `middlesbrough` `newcastle` `norwich` `nottm-forest` `portsmouth` `qpr` `reading` `sheffield-utd` `southampton` `stoke` `sunderland` `swansea` `tottenham` `watford` `west-brom` `west-ham` `wigan` `wolves`

**스페인 구단 ID (고정)**: `real-madrid` `barcelona` `atletico-madrid` `valencia` `sevilla` `villarreal` `real-sociedad` `athletic-bilbao` `real-betis` `celta-vigo` `espanyol` `deportivo` `mallorca` `osasuna` `getafe` `levante` `malaga` `real-zaragoza` `racing-santander` `real-valladolid` `rayo-vallecano` `alaves` `las-palmas` `granada` `almeria` `elche` `eibar` `leganes` `girona` `cadiz` `huesca` `sporting-gijon` `tenerife` `numancia` `recreativo` `real-murcia` `xerez` `hercules` `cordoba` `gimnastic` `real-oviedo` `albacete`

**이탈리아 구단 ID (고정)**: `juventus` `inter` `milan` `roma` `lazio` `napoli` `atalanta` `fiorentina` `torino` `bologna` `udinese` `sampdoria` `genoa` `parma` `cagliari` `chievo` `lecce` `empoli` `sassuolo` `hellas-verona` `palermo` `catania` `siena` `livorno` `reggina` `brescia` `perugia` `piacenza` `bari` `vicenza` `ascoli` `messina` `treviso` `cesena` `novara` `pescara` `frosinone` `carpi` `crotone` `spal` `benevento` `salernitana` `spezia` `venezia` `monza` `cremonese` `como` `pisa` `modena` `ancona`

**독일 구단 ID (고정)**: `bayern` `dortmund` `leverkusen` `schalke` `werder-bremen` `hamburg` `stuttgart` `wolfsburg` `gladbach` `hertha` `koln` `frankfurt` `hoffenheim` `mainz` `freiburg` `augsburg` `hannover` `nurnberg` `kaiserslautern` `bochum` `leipzig` `union-berlin` `hansa-rostock` `1860-munich` `energie-cottbus` `arminia-bielefeld` `duisburg` `alemannia-aachen` `karlsruhe` `st-pauli` `fortuna-dusseldorf` `paderborn` `darmstadt` `ingolstadt` `braunschweig` `greuther-furth` `unterhaching` `heidenheim` `holstein-kiel`

**프랑스 구단 ID (고정)**: `psg` `marseille` `lyon` `monaco` `lille` `rennes` `bordeaux` `nantes` `lens` `nice` `saint-etienne` `montpellier` `toulouse` `auxerre` `sochaux` `strasbourg` `metz` `lorient` `reims` `angers` `brest` `nancy` `guingamp` `bastia` `ajaccio` `gazelec-ajaccio` `caen` `le-havre` `troyes` `sedan` `valenciennes` `evian` `dijon` `nimes` `amiens` `clermont` `istres` `grenoble` `boulogne` `arles-avignon` `le-mans` `paris-fc`

목록에 없는 구단이 필요하면 같은 규칙(영문 통칭, 소문자, 하이픈)으로 만들고, 만들기 전에 `data/clubs/`에 비슷한 이름이 있는지 확인한다.

선수 `name`(화면 표시 이름)도 위키백과 문서 제목과 같게 쓴다. 한 이름만 쓰는 선수(브라질 등)는 그 이름 그대로 (`Kanu`, `Edu`).
ID는 여러 시즌에서 같은 선수를 이어주는 열쇠이므로, 다른 시즌 파일에 이미 있는 선수면 **기존 ID를 그대로 쓴다** (`grep -r "선수이름" data/seasons`로 확인).
| 시즌 | `YYYY-YY` | `2000-01`, `2025-26` |
| 국가 | FIFA 3글자 코드 | `ENG`, `FRA`, `KOR` |

## 구단 시즌 파일

```jsonc
{
  "season": "2025-26",
  "club": "arsenal",               // clubs.json의 id
  "league": "eng1",
  "reputation": 92,                // 1~99 구단 명성
  "finance": {
    "balance": 150000000,          // 보유 자금 (EUR)
    "transferBudget": 120000000,   // 이적 예산 (EUR)
    "wageBudget": 5200000          // 주급 총액 한도 (EUR / 주)
  },
  "facilities": { "training": 5, "youth": 5 },   // 1~5
  "stadiumCapacity": 60704,
  "formation": "4-3-3",            // 그 시즌 실제로 가장 많이 쓴 포메이션 (AI 선발 기준)
  "estimated": true,               // 재정이 추정값이면 true
  "squad": [ /* 선수 항목 */ ]
}
```

### 포메이션
`4-4-2` `4-4-1-1` `4-3-3` `4-2-3-1` `4-1-4-1` `4-5-1` `4-3-1-2` `4-1-2-1-2`(다이아몬드) `4-2-2-2`
`3-5-2` `3-4-3` `3-4-2-1` `3-4-1-2` `5-3-2` `5-4-1`

## 선수 항목

```jsonc
{
  "id": "bukayo-saka-2001",
  "name": "Bukayo Saka",           // 화면 표시 이름 (통칭)
  "fullName": "Bukayo Ayoyinka Temidayo Saka",  // 선택
  "birth": "2001-09-05",
  "nation": "ENG",
  "nation2": "NGA",                // 선택: 복수 국적
  "height": 178,                   // cm
  "foot": "L",                     // L / R / B(양발)
  "looks": { "hair": "short_curly", "hairColor": "black", "beard": "none" },  // 선택
  "number": 7,
  "pos": "RW",
  "alt": ["LW"],                   // 선택: 가능 포지션
  "attrs": { "sho": 82, "pas": 84, "dri": 88, "tac": 55, "pos": 60, "aer": 52,
             "pac": 86, "sta": 84, "str": 64, "vis": 86, "com": 84, "ldr": 70 },
  "wage": 230000,                  // 주급 (EUR)
  "contract": "2027-06-30",        // 계약 만료일
  "loan": "chelsea",               // 선택: 임대 원소속 구단 id (임대 선수만)
  "traits": ["big_game"],          // 선택: 특성 태그
  "verify": true                   // 선택: 정보가 불확실하면 true
}
```

### 포지션
`GK` `CB` `LB` `RB` `LWB` `RWB` `DM` `CM` `AM` `LM` `RM` `LW` `RW` `ST`

### 능력치 (1~99, 12개)

| 키 | 필드 선수 | 키 | 골키퍼 (sho·dri·tac 대신) |
|---|---|---|---|
| `sho` | 슈팅 | `ref` | 반사신경 |
| `pas` | 패스 | `han` | 핸들링 |
| `dri` | 드리블 | `one` | 1대1 |
| `tac` | 태클 | | |
| `pos` | 위치선정 | | |
| `aer` | 공중볼 | | |
| `pac` | 속도 | | |
| `sta` | 체력 | | |
| `str` | 피지컬 | | |
| `vis` | 시야 | | |
| `com` | 침착성 | | |
| `ldr` | 리더십 | | |

골키퍼는 `ref han one pas pos aer pac sta str vis com ldr` 12개를 쓴다.

### 능력치 기준선

| 범위 | 수준 |
|---|---|
| 90~99 | 세계 최고 (발롱도르급), 해당 능력치에서 역대급 |
| 80~89 | 빅클럽 주전, 국가대표 핵심 |
| 70~79 | 1부 리그 주전급 |
| 60~69 | 1부 하위권 주전 / 2부 상위 |
| 50~59 | 2부 주전 / 1부 후보 |
| 40~49 | 유망주, 하부 리그 |

- **시즌마다 그 시즌의 실력**으로 매긴다. 같은 선수라도 2015년과 2022년 값이 다르다.
- 리그 간 수준 차이를 반영한다 (같은 70이면 리그와 무관하게 같은 실력).
- 포지션과 무관한 능력치도 현실적으로 매긴다 (센터백 슈팅 40대 등).

### 외형 태그 (선택, 없으면 국적 기반 랜덤)

| 키 | 값 |
|---|---|
| `hair` | `bald` `buzz` `short` `short_curly` `curly` `afro` `medium` `long` `bun` `ponytail` `dreadlocks` `braids` `mohawk` `slick` `undercut` |
| `hairColor` | `black` `brown` `blonde` `red` `grey` `dyed` |
| `beard` | `none` `stubble` `short` `full` `goatee` `mustache` |
| `skin` | 1(가장 밝음) ~ 8(가장 어두움) |
| `acc` | `headband` `hairband` `glasses` |

시즌마다 헤어스타일이 바뀌는 경우는 시즌 파일에 적힌 값을 그 시즌에 쓴다 (외형은 불일치 검사에서 제외).

### 특성 태그 (선택, 최대 3개)
`big_game` `injury_prone` `free_kick` `penalty` `long_shot` `playmaker` `target_man`
`speedster` `engine` `leader` `flair` `sweeper_keeper` `aerial_threat` `clutch`

## 다국어 이름 (`locale/<언어>/players.json`)

선수 이름 번역은 시즌 파일이 아니라 언어별 파일에 **선수 ID당 1번만** 적는다. 게임 기본 언어는 한국어(`ko`).
번역이 없는 언어는 시즌 파일의 영문 `name`을 그대로 표시한다.

```jsonc
{
  "bukayo-saka-2001": { "name": "부카요 사카", "short": "사카" },
  "nwankwo-kanu-1976": { "name": "카누", "short": "카누" }
}
```
- `name`: 전체 표시 이름, `short`: 좁은 화면(경기 화면·라인업)용 짧은 이름 (보통 성)
- 한국어 표기는 **국내 중계·언론에서 통용되는 표기**를 우선한다 (예: 외데고르, 요케레스, 비에이라, 베르흐캄프)
- 구단·국가·리그 이름은 각 마스터 파일의 `ko` 필드를 쓴다. 다른 언어는 나중에 `locale/<언어>/clubs.json` 등으로 추가

## 작성 우선순위 · 정확도

1. 확실한 정보만 적고, 불확실한 선수는 `"verify": true`.
2. 등번호·계약·주급이 불확실하면 그럴듯한 값을 넣고 `verify` 표시.
3. 재정(balance·budget)은 공개 자료 기반 추정치. 파일에 `"estimated": true`.
4. 스쿼드는 **여름 이적시장 마감 직후(9월 초) 1군** 기준 22~30명. 겨울(1월) 영입은 넣지 않는다. 임대 온 선수는 넣고(`loan` 표시), 임대 나간 선수는 뺀다.
5. 능력치는 **그 시즌 실력** 기준. 같은 선수의 앞뒤 시즌 데이터가 이미 있으면 그 값을 참고해 흐름이 자연스럽게 이어지게 한다 (전성기 전엔 상승, 30대 이후엔 신체 능력치 하락).
6. 다 쓰면 `node tools/validate.js <시즌>`으로 검사하고 오류를 모두 고친다.
