// 게임 버전 (첫 화면에 표시). 기능을 넣거나 고칠 때마다 올린다 — 기능 추가 0.1 단위, 작은 수정 0.0.1 단위
//  바꿀 때 아래 CHANGELOG 맨 위에 한 줄 요약을 넣고, README 개발 현황에도 적는다
//  첫 화면은 새 버전을 처음 본 뒤 24시간 동안 '업데이트 소식'을 보여 준다 (UpdateNotes.tsx)
export const GAME_VERSION = '0.5';

export interface ChangeEntry { version: string; date: string; items: string[] }

/** 업데이트 내역 (새 것이 위). 플레이어가 읽는 글이므로 쉬운 말로 */
export const CHANGELOG: ChangeEntry[] = [
  { version: '0.5', date: '2026-11-11', items: [
    '처음 게임에 들어가면 기본 조작을 알려 주는 튜토리얼이 나옵니다 (건너뛰기 가능)',
    '도움말 · 사용 설명서: 첫 화면 메뉴와 게임 안 사이드바에서 열 수 있습니다',
    '도움말에서 튜토리얼을 언제든 다시 볼 수 있습니다',
  ] },
  { version: '0.4.1', date: '2026-11-11', items: [
    '첫 화면에 업데이트 소식이 하루 동안 표시됩니다',
  ] },
  { version: '0.4', date: '2026-11-11', items: [
    '멀티 포지션: 선수마다 보조 포지션이 생겼고, 주 · 보조 포지션에서는 능력이 깎이지 않습니다',
    '선수 정보에서 포지션별 능력을 볼 수 있습니다',
    '이벤트 선택지에 효과가 미리 나오지 않고, 고른 뒤 결과가 이어서 나옵니다',
    '새 이벤트: 스폰서 제안 · 해외 친선 투어 · 자선 행사 · 선수단 미팅, 기자회견 질문 추가',
  ] },
  { version: '0.3', date: '2026-11-11', items: [
    '스카우트: 다른 구단 선수 능력치는 아는 만큼만 범위로 보입니다',
    '스카우트를 보내면 정확한 능력치와 숨은 성향(프로의식 · 야망 등)을 알 수 있습니다',
    '리그 전체 관찰 · 설정에서 스카우트 끄기',
  ] },
  { version: '0.2', date: '2026-11-11', items: [
    '내 포메이션: 자리마다 포지션을 바꿔 나만의 포메이션을 만들 수 있습니다 (말이 안 되는 구성은 불가)',
  ] },
];

const cmp = (a: string, b: string) => {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
};
/** from 보다 새 버전의 내역 (from 이 없으면 현재 버전만) */
export const changesSince = (from: string | null) => CHANGELOG.filter((e) => (from ? cmp(e.version, from) > 0 : e.version === GAME_VERSION));
