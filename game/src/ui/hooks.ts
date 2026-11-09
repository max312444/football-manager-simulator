import { useGame } from '../store/game';
import type { World } from '../engine/types';
import { useEffect, useState } from 'react';
import { loadHistory } from '../data/db';
import type { PlayerHistory } from '../engine/traits';

/** 월드 + 갱신 신호 구독 (엔진이 월드를 직접 수정하므로 rev로 다시 그림) */
export function useWorld(): World {
  useGame((s) => s.rev);
  return useGame((s) => s.world)!;
}

/** 데이터 시즌 선수 이력 (처음 한 번만 불러와 공유) */
let histCache: PlayerHistory | null | undefined;
let histLoading: Promise<PlayerHistory | null> | null = null;
export function useHistory(): PlayerHistory | null {
  const [h, setH] = useState(histCache ?? null);
  useEffect(() => {
    if (histCache !== undefined) return;
    histLoading ??= loadHistory().then((x) => (histCache = x));
    let alive = true;
    histLoading.then((x) => alive && setH(x));
    return () => { alive = false; };
  }, []);
  return h;
}

// 개발 중 변경 시 페이지 전체 새로 고침 (상태 어긋남 방지)
if (import.meta.hot) import.meta.hot.accept(() => location.reload());
