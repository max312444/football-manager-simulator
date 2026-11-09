# PITCH BOSS (가칭)

2000/01 시즌부터 지금까지, 유럽 5대 리그의 시즌별 선수단으로 시작하는 **한국어 축구 감독 시뮬레이션**입니다.
비공식 팬 프로젝트이며, 실제 리그 · 구단 · 선수 및 어떤 게임사와도 관계가 없습니다 ([NOTICE.md](NOTICE.md)).

## 실행

```bash
cd game
npm install
npm run dev        # http://localhost:5173
npm test           # 단위 테스트 (vitest)
npx tsc --noEmit -p .   # 타입 검사
```

- 기본 데이터는 `data-public/`의 **가상 이름 데이터**입니다 (선수 · 구단 · 리그 이름을 바꾼 패러디 데이터).
- 진행은 브라우저에 자동 저장되며, 슬롯 3개에 직접 저장할 수도 있습니다.

## 주요 기능

**커리어 · 시즌**
- 원하는 시즌 · 리그 · 구단으로 시작, 다음 시즌으로 이어지는 커리어 (실제 능력치 갱신 · 새 선수 등장 · 데이터가 끝난 뒤 성장/노화 엔진)
- **1부 · 2부 승강제**: 나라 · 시대별 실제 규칙 (자동 승강 · 승격 플레이오프 · 승강 플레이오프 · 승부차기). 게임 순위대로 승강하며 내 구단도 강등될 수 있음
- 시즌 수상 (우승 · 득점왕 · 도움왕 · MVP · 영플레이어 · 골든글러브)과 수상 연출, 보상 (팬 · 상금 · 일시 능력치 상승)
- 시즌 말 소식: 계약 만료로 팀을 떠난 핵심 선수 → 은퇴 선수 → 시즌 결산

**경기**
- 5분 단위 경기 엔진: 경기 중 전술 변경 · 교체, 컨디션과 경기 기복
- 경기 전 스쿼드 설정 (상대에 맞춘 AI 추천에서 시작), 경기별 POM · 워스트

**선수 · 구단 관리**
- 이적: 선수 검색 · 관심 목록 · 영입 협상 창 (이적료 · 주급 각 3번, 결렬 시 이적시장 동안 협상 불가), FA는 주급만 협상
- 받은 제안에 역제안 협상, 이적 명단 선수 판매
- 계약: 불만 없는 선수는 자동 재계약, 불만 있는 선수는 재계약 요청 팝업 → 직접 협상, 안 하면 FA로 떠남
- 재정 (중계권 · 입장 · 스폰서 · 상금 / 주급 · 운영비, 이사회 예산), 팬 수
- 호칭 (경기 기록으로 붙고 노쇠 · 스타일 변화로 사라짐), 충성도, 숨은 속성, 언론 평가
- 선수 상세 정보 (능력치 · 호칭 · 수상 경력 · 이전 구단 경력), 상단 전체 검색 (`/` 또는 Ctrl+K)

## 실명 데이터로 플레이하기 (선택, 각자 생성)

저장소에는 실명 데이터가 없습니다. 원하면 공개 출처(Wikidata · 위키백과)에서 **직접 만들 수 있습니다.**
만든 데이터는 내 PC의 `data/`에만 저장되고 저장소에는 올라가지 않습니다 (`.gitignore`).

```bash
# 리그별 구축 (리그당 약 1시간, 위키미디어 API 요청 간격을 지킵니다). --apply 없으면 미리보기
node tools/data_pipeline build --league eng1 --apply     # 1부: eng1 esp1 ita1 ger1 fra1
node tools/data_pipeline build --league eng2 --apply     # 2부: eng2 esp2 ita2 ger2 fra2

# 한국어 이름 (Wikidata 한국어 표기)
node tools/data_pipeline names --league eng1 --apply

# 검사
node tools/validate.js
```

실명 데이터가 있으면 새 게임 화면의 **"이름 데이터 → 실명 (내 PC)"**로 바꿀 수 있습니다.

> 실명 데이터는 개인적 · 비상업적 용도로만 사용하세요. 다른 곳에 배포하지 마세요.

### 공개용 데이터 다시 만들기 (관리자용)

```bash
node tools/data_pipeline publish --apply   # data/ (실명) → data-public/ (패러디)
cd game && npm run history                 # 선수 이력 (data-public/history/players.json)
```

## 구성

| 경로 | 내용 |
|---|---|
| `game/` | 게임 (React 19 + TypeScript + Vite 6 + Tailwind 4 + Zustand 5). 엔진은 `game/src/engine/` |
| `tools/data_pipeline/` | 데이터 수집 · 검증 · 공개용 변환 파이프라인 (Node.js) |
| `data-public/` | 공개용 패러디 데이터 (CC BY-SA 4.0) |
| `data/` | 파이프라인 설정 (리그 · 국가 · 구단 별칭). 실명 데이터는 여기에 생성되며 저장소에서 제외 |
| `docs/` | 엔진 설계 문서 |

### 엔진 파일 (`game/src/engine/`)

| 파일 | 역할 |
|---|---|
| `world.ts` | 월드 생성 · 하루 진행 (`advanceDay`) · 경기 결과 적용 |
| `season.ts` | 시즌 마감 (`closeSeason`) · 다음 시즌 (`startNextSeason`: 승강 · 은퇴 · 계약 만료 · 새 선수) |
| `pyramid.ts` | 1부 · 2부 승강 규칙 (`pairRule`), 플레이오프 진행 (`playoffDay`), 순위 구간 |
| `match.ts` | 경기 엔진 (POM · 워스트 포함) |
| `transfer.ts` | 몸값 · 이적시장 기간 · 영입 판단 · 협상 횟수 · AI 이적 · 받은 제안 · 역제안 |
| `contract.ts` | 재계약 판단 · 자동 재계약 · 재계약 요청 |
| `finance.ts` | 수입 · 지출 장부, 이사회 예산 |
| `awards.ts` | 시즌 수상 · 팬 수 |
| `traits.ts` | 호칭 |
| `loyalty.ts` · `condition.ts` · `ratings.ts` · `squad.ts` · `ai.ts` · `analysis.ts` | 충성도 · 컨디션 · 능력치 · 선발 · AI 선발 · 구단 분석 |

화면은 `game/src/ui/` (screens · views · components), 상태는 `game/src/store/` (`game.ts` 게임 진행, `app.ts` 화면 전환).

## 라이선스

- 코드: MIT ([LICENSE](LICENSE))
- 데이터: CC BY-SA 4.0 · 출처 Wikidata (CC0), English Wikipedia (CC BY-SA 4.0) ([data/LICENSE.md](data/LICENSE.md))
- 이름 · 상표에 대한 권리는 부여하지 않습니다 ([NOTICE.md](NOTICE.md))

---

## 개발 현황 · 이어서 하기

> 새 작업 세션은 이 절을 먼저 읽고 이어서 진행한다. (마지막 갱신: 2026-11-09)

### 작업 규칙

- 설명 · 보고는 **한국어**로 한다. 변경할 때마다 **테스트 후 결과를 보고**한다 (타입 검사 · `npm test` · 필요하면 브라우저).
- 테스트 · 시연 기본 구단은 **리버풀** (공개 데이터 이름 "리버폴", ID `c83d96l`).
- 커밋 · 푸시는 **요청이 있을 때만**. **실명 데이터(`data/seasons` 등)는 절대 커밋하지 않는다.** 실제 로고는 쓰지 않는다.
- 데이터 원칙: 공개 출처(Wikidata · 위키백과 API)만, 웹 스크래핑을 기본 수집 방식으로 쓰지 않음, FM 등 상용 게임 DB 복제 금지,
  출처 없는 능력치를 사실처럼 저장하지 않음 (능력치 · 재정 · 명성은 자체 추정 모델 `derived`), 이름 유사도만으로 자동 병합 금지,
  유료 API · 유료 리소스는 사용자 승인 없이 사용 금지, API 키는 환경 변수로만 (`.env` 커밋 금지).
- 데이터 작성 규칙: [data/DATA_GUIDE.md](data/DATA_GUIDE.md)

### 개발 팁

- 개발 모드에서 브라우저 콘솔 `window.__game` 으로 게임 상태(Zustand 스토어)에 접근할 수 있다 (배포 빌드에는 없음).
- 브라우저 확인은 Playwright(`playwright-core` + 설치된 Chrome)로 스크린샷을 찍어 확인해 왔다.
- 엔진 테스트는 `data-public/`을 직접 읽어 월드를 만든다 (`*.test.ts` 참고).

### 완료된 작업 (최근 순)

1. **2부 리그 · 승강제 엔진** (커밋됨, 실제 2부 데이터 연결 전)
   - `pyramid.ts`: 나라 · 시대별 규칙. 잉글랜드 3강등/2승격+3~6위 PO, 스페인(2010~) · 이탈리아(2006~) 같은 방식,
     독일(2008~) 2+1부 16위 vs 2부 3위 승강 PO, 프랑스(2017~) 5위→4위→3위 사다리 PO 승자 vs 1부 16위.
   - 플레이오프 경기는 정규 시즌 뒤 자동 편성 (`Fixture.stage`, 순위표 제외), 동점이면 승부차기 (연장전 없음).
   - `startNextSeason`: 게임 순위 + PO 결과로 승강, 리그 크기는 실제 다음 시즌 데이터에 맞춤.
     2부에서 떨어진 구단은 `<리그>-lower` 대기(경기 없음). 2부 빈자리는 실제 3부 승격 구단 → 없으면 대기 구단 명성 순.
     3부가 없어 **2부 꼴찌의 내 구단만** 잔류 처리. 강등 시 명성 −5 · 예산 ×0.45, 승격 시 명성 +4 · 예산 ×2.
   - 순위표 구간 색 · 범례 · 플레이오프 패널, 경기 이름 (`roundLabel`), 시즌 결산에 내 구단 승강 표시.
   - 연 매출 기준을 주급 예산 범위로 제한 (강등 후 매출 하락). 시즌 종료 알림이 2번째 시즌부터 안 뜨던 버그 수정.
   - 테스트: `pyramid.test.ts` (다른 나라 1부 구단으로 만든 임시 2부로 검증).
2. 재계약 · 자동 재계약 · 재계약 요청 팝업, 시즌 말 이탈 소식, 떠난 선수 제안 정리 버그 수정 (`2997762`)
3. 수상 연출 · POM · 팬 · 이적 협상 개편 · 은퇴 소식 · 전체 검색 · 게임 계약 부여 (`0702815`)
4. 재정 · 호칭 시스템 (`631e9b8`), 이적 시스템 · 5개 리그 데이터 (이전 커밋들)

### 진행 중: 2부 리그 데이터 수집

- 파이프라인 설정 완료 (`tools/data_pipeline/config.js` `LEAGUES`에 eng2 · esp2 · ita2 · ger2 · fra2,
  시대별 위키백과 시즌 문서 이름, `steps/model.js` 2부 리그 수준 0.80~0.86).
- 구단 ID 충돌 처리: FSV 프랑크푸르트 별도 ID (`fsv-frankfurt`), 얀 레겐스부르크 두 Wikidata 항목 → `jahn-regensburg`
  (`data/canonical/club-aliases.json`, 사람이 확인한 같은 구단 목록 `data/canonical/club-same.json`).
- **다음 할 일** (ger2 미리보기가 끝나지 않았으면 다시 실행):
  ```bash
  node tools/data_pipeline build --league ger2            # 미리보기: 충돌 · 시즌별 구단 수 · 선수 수 확인
  node tools/data_pipeline build --league ger2 --apply    # 문제 없으면 저장 → eng2 · esp2 · ita2 · fra2 같은 순서
  node tools/data_pipeline names --league ger2 --apply    # 한국어 이름
  node tools/validate.js                                  # 검사
  node tools/data_pipeline publish --apply                # 공개용 패러디 데이터 (1부와 똑같이 가상 이름)
  cd game && npm run history                              # 선수 이력 다시 만들기
  ```
  새 충돌이 나오면 `club-aliases.json`에 지정 (같은 구단이 시대별로 나뉜 경우만 `club-same.json`).
- 데이터가 들어오면: 게임에서 2부 구단으로 새 게임 → 시즌 진행 → 플레이오프 · 승강 · 순위표 화면을 브라우저로 확인.

### 다음 로드맵 (사용자가 정한 순서)

1. 2부 리그 데이터 수집 마무리 (위) → 게임에서 확인
2. **국내 컵 대회** (FA컵 · 코파 델 레이 등, 1 · 2부 녹아웃, 주중 일정 · 상금)
3. **유럽 대회** (챔피언스리그 · 유로파리그, 리그 순위로 출전권)
4. **월드컵** (국가대표 선발 · 클럽 일정 중단)

### 남은 과제 · 알려진 문제

- 선수 육성 (숨은 속성 · 훈련), 대표팀 차출, '구단' 메뉴 (사이드바에 있으나 비어 있음), 리그별 밸런스 점검
- 데이터 점검: 나이 이상 19명, 생일 불일치 34건, 골키퍼 없는 구단 5곳, 승격팀 누락 (esp1 2019-20 · ita1 2025-26),
  묀헨글라트바흐 2024-25 선수 12명, 판단 안 한 동명이인 179건
- 받은편지함 일부 알림(이사회 예산 · 호칭 변화)에 영문 이름이 나옴
- 새 게임 시작 시 FA 선수가 없음 (방출 · 계약 만료로 생김)
- 데이터에 계약 정보는 약 19%만 있음 → 나머지는 게임이 1~5년 부여 (`contractGen`, 화면에 "게임 설정" 표시)
