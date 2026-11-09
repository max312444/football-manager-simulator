import { useGame } from '../store/game';
import type { World } from '../engine/types';

/** 월드 + 갱신 신호 구독 (엔진이 월드를 직접 수정하므로 rev로 다시 그림) */
export function useWorld(): World {
  useGame((s) => s.rev);
  return useGame((s) => s.world)!;
}

// 개발 중 변경 시 페이지 전체 새로 고침 (상태 어긋남 방지)
if (import.meta.hot) import.meta.hot.accept(() => location.reload());
