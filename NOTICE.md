# 고지 · 출처 · 라이선스 (NOTICE)

## 비공식 팬 프로젝트

이 프로젝트(가칭 PITCH BOSS)는 **개인이 만든 비상업적 팬 프로젝트**입니다.

- 프리미어리그, 라리가, 세리에 A, 분데스리가, 리그 1, 각 구단, 선수, 선수협회(FIFPro) 및 Football Manager(Sports Interactive / SEGA)와 **아무런 관계가 없으며, 이들의 승인이나 후원을 받지 않았습니다.**
- 구단·리그·선수 이름은 사실 정보를 설명하기 위한 목적으로만 쓰입니다. 각 이름과 상표의 권리는 해당 권리자에게 있습니다.
- 게임에 표시되는 **엠블럼은 이 프로젝트가 직접 그린 디자인**이며, 실제 구단 로고가 아닙니다. 실제 로고 파일은 저장소에 포함하지 않습니다. 사용자가 개인적으로 넣는 로고 파일(`game/src/assets/crests/`)은 커밋에서 제외됩니다.
- 이 프로젝트는 판매하지 않습니다. 상업적 이용이나 공개 배포 형태가 바뀌면 이 고지와 데이터 구성(실명 데이터 분리 등)을 다시 검토합니다.

## 데이터 출처

| 데이터 | 출처 | 라이선스 |
|---|---|---|
| 선수 신원 정보 (생년월일, 국적, 키, 포지션), 구단 소속 기록, 리그 시즌 참가 구단, 한국어 표기 | [Wikidata](https://www.wikidata.org/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| 시즌별 1군 선수단 명단 (등번호, 임대 여부), 시즌 순위표의 참가 구단 | [영어 위키백과](https://en.wikipedia.org/) 구단·시즌 문서의 과거 판 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |

- 수집은 Wikimedia가 제공하는 공개 API(SPARQL, MediaWiki API)로 했고, 요청 간격 제한과 식별용 User-Agent를 지켰습니다. 웹 페이지 스크래핑은 쓰지 않았습니다.
- 위키백과에서 가져온 각 구단 시즌 파일에는 원본 문서와 판 번호를 `source` 항목으로 기록했습니다 (예: `enwiki:FC Barcelona@570987618`).
- 위키백과 유래 데이터를 재배포할 때는 출처 표기와 같은 조건(CC BY-SA 4.0) 공유가 필요할 수 있습니다.
- **Football Manager 등 상업 게임의 데이터베이스는 사용하지 않았습니다.**

## 추정치 (실제 값이 아님)

다음 값은 출처에서 얻은 신호로 **계산한 추정치**이며, 실제 선수·구단의 공식 수치가 아닙니다.

- 선수 능력치 12개 항목: 지명도(위키 문서 수), 국가대표 출전 수, 나이, 리그 수준을 쓴 자체 모델 (`pipeline-derived-v1`, 신뢰도 낮음). 프리미어리그 일부는 초기 추정값(`llm-estimate v0`)
- 주급, 이적 예산, 구단 명성
- 숨은 속성(꾸준함 등): 세이브마다 게임이 생성

각 값의 출처 구분은 `data/canonical/attribute-sources.json`에 기록되어 있습니다.

## 사용한 오픈소스

| 구성 요소 | 라이선스 |
|---|---|
| React, Vite, Zustand, Tailwind CSS, Vitest, TypeScript | MIT / Apache-2.0 (각 패키지의 LICENSE 참고) |
| Pretendard (글꼴) | SIL Open Font License 1.1 |
| JetBrains Mono (글꼴) | SIL Open Font License 1.1 |

## 문의 · 삭제 요청

이 저장소의 내용이 권리를 침해한다고 판단되면 GitHub 이슈로 알려 주세요. 확인 후 신속히 수정하거나 삭제하겠습니다.
