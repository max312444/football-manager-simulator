# PITCH BOSS (가칭)

2000/01 시즌부터 지금까지, 5대 리그의 시즌별 선수단으로 시작하는 **한국어 축구 감독 시뮬레이션**입니다.
비공식 팬 프로젝트이며, 실제 리그 · 구단 · 선수 및 어떤 게임사와도 관계가 없습니다 ([NOTICE.md](NOTICE.md)).

## 실행

```bash
cd game
npm install
npm run dev        # http://localhost:5173
```

- 기본 데이터는 `data-public/`의 **가상 이름 데이터**입니다 (선수 · 구단 · 리그 이름을 바꾼 패러디 데이터).
- 진행은 브라우저에 자동 저장되며, 슬롯 3개에 직접 저장할 수도 있습니다.

## 주요 기능

- 원하는 시즌 · 리그 · 구단으로 시작, 다음 시즌으로 이어지는 커리어 (실제 능력치 갱신 · 승격팀 · 새 선수 등장)
- 5분 단위로 진행되는 경기 엔진: 경기 중 전술 변경 · 교체, 컨디션과 경기 기복
- 경기 전 스쿼드 설정: 상대에 맞춘 AI 추천 선발에서 시작해 직접 수정
- 출전 시간에 따른 선수 충성도, 숨은 속성, 게임 속 언론 평가

## 실명 데이터로 플레이하기 (선택, 각자 생성)

저장소에는 실명 데이터가 없습니다. 원하면 공개 출처(Wikidata · 위키백과)에서 **직접 만들 수 있습니다.**
만든 데이터는 내 PC의 `data/`에만 저장되고 저장소에는 올라가지 않습니다 (`.gitignore`).

```bash
# 리그별 구축 (리그당 약 1시간, 위키미디어 API 요청 간격을 지킵니다)
node tools/data_pipeline build --league eng1 --apply
node tools/data_pipeline build --league esp1 --apply
node tools/data_pipeline build --league ita1 --apply
node tools/data_pipeline build --league ger1 --apply
node tools/data_pipeline build --league fra1 --apply

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
```

## 구성

| 경로 | 내용 |
|---|---|
| `game/` | 게임 (React + TypeScript + Vite). 엔진은 `game/src/engine/` |
| `tools/data_pipeline/` | 데이터 수집 · 검증 · 공개용 변환 파이프라인 (Node.js) |
| `data-public/` | 공개용 패러디 데이터 (CC BY-SA 4.0) |
| `data/` | 파이프라인 설정 (리그 · 국가 · 구단 별칭). 실명 데이터는 여기에 생성되며 저장소에서 제외 |
| `docs/` | 엔진 설계 문서 |

## 라이선스

- 코드: MIT ([LICENSE](LICENSE))
- 데이터: CC BY-SA 4.0 · 출처 Wikidata (CC0), English Wikipedia (CC BY-SA 4.0) ([data/LICENSE.md](data/LICENSE.md))
- 이름 · 상표에 대한 권리는 부여하지 않습니다 ([NOTICE.md](NOTICE.md))
