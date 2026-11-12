// 이사회 이벤트 선택 창 (스타 판매 요구 · 유스 기용 요구 · 이사회가 원하는 선수 · 감독 교체 소문 · 팬 시위)
import type { World } from '../../engine/types';
import { overall } from '../../engine/ratings';
import { marketValue } from '../../engine/transfer';
import { clubKo, playerKo } from '../../data/db';
import { useGame } from '../../store/game';
import { money } from '../format';
import { useWorld } from '../hooks';

/** 이벤트 제목 · 설명 (받은편지함과 같이 씀) */
export function boardEventText(w: World, kind: string, player?: string): { title: string; body: string } {
  const p = player ? w.players[player] : null;
  const name = p ? playerKo(p.id, p.name) : '';
  switch (kind) {
    case 'sellStar': return { title: `이사회: "${name}를 팔아 재정을 메우시오"`, body: `구단 잔고가 마이너스입니다. 이사회는 가장 값비싼 선수(시장 가치 ${p ? money(marketValue(w, p)) : '–'})를 팔기를 원합니다.` };
    case 'youth': return { title: '이사회: "유스 선수에게 기회를 주시오"', body: '이사회는 구단이 키운 젊은 선수들이 더 뛰기를 원합니다.' };
    case 'wanted': return { title: `이사회: "${name}를 데려오면 좋겠소"`, body: p ? `${clubKo(p.clubId ?? '')} · 능력 ${overall(p)} · 시장 가치 ${money(marketValue(w, p))}. 마케팅에도 도움이 될 선수라며 이적료 일부를 지원하겠다고 합니다.` : '' };
    case 'rumour': return { title: '언론: "이사회가 후임 감독을 접촉했다"', body: '성적 부진 속에 감독 교체 소문이 돌고 있습니다.' };
    case 'sponsor': return { title: '스폰서 제안 · 베팅 회사', body: '해외 베팅 회사가 유니폼 소매 스폰서 계약을 제안했습니다. 계약금은 크지만 일부 팬들은 좋아하지 않을 수 있습니다.' };
    case 'tour': return { title: 'A매치 휴식기 해외 친선 투어 초청', body: '아시아의 한 리그가 A매치 휴식기에 친선 경기 두 번을 제안했습니다. 초청료가 나옵니다.' };
    case 'charity': return { title: '지역 자선 행사 초청', body: '연고지 어린이 병원 후원 행사에 구단을 초청했습니다.' };
    case 'meeting': return { title: '선수단: "이야기 좀 하고 싶습니다"', body: '최근 분위기가 가라앉자 고참 선수들이 선수단 미팅을 요청했습니다.' };
    case 'protest': return { title: '팬 시위', body: '경기장 밖에서 팬들이 감독과 구단을 비판하는 시위를 벌이고 있습니다.' };
    case 'ownerRich': return { title: '구단주가 바뀌었습니다 · 새 구단주가 대규모 투자를 약속했습니다', body: '잔고와 예산이 크게 늘었습니다 · 이사회 관계는 새로 시작합니다' };
    case 'ownerCut': return { title: '구단주가 바뀌었습니다 · 새 구단주는 긴축 재정을 원합니다', body: '이적 · 주급 예산이 줄었습니다 · 이사회 관계는 새로 시작합니다' };
  }
  return { title: '이사회', body: '' };
}

/** 이벤트 분류 표시 */
export const boardTag = (kind: string) => (kind === 'rumour' ? '언론' : kind === 'protest' ? '팬' : kind === 'meeting' ? '선수단' : ['sponsor', 'tour', 'charity', 'ownerRich', 'ownerCut'].includes(kind) ? '구단' : '이사회');

export function BoardEventModal() {
  const w = useWorld();
  const ev = w.manager?.boardEvent;
  const choose = useGame((s) => s.boardChoose);
  const result = useGame((s) => s.eventResult);
  if (!ev || w.manager?.pendingJob || result) return null;
  const t = boardEventText(w, ev.kind, ev.player);
  return (
    <div className="fixed inset-0 z-[65] grid animate-[fade_0.2s_ease-out] place-items-center bg-ink-950/85 p-2 sm:p-6 backdrop-blur-sm">
      <div className="panel w-full max-w-[540px] overflow-hidden">
        <div className="px-4 sm:px-7 pt-7 pb-4">
          <div className="text-[12px] font-semibold text-amber">{boardTag(ev.kind)}</div>
          <h2 className="mt-1 text-[19px] leading-snug font-semibold">{t.title}</h2>
          <div className="mt-2 text-[13px] text-mid">{t.body}</div>
        </div>
        <div className="space-y-2 px-4 sm:px-7 pb-7">
          {ev.options.map((o) => (
            <button key={o.key} onClick={() => choose(o.key)} className="w-full rounded-xl bg-ink-900 px-4 py-3 text-left transition-colors hover:bg-ink-800">
              <div className="text-[14px] font-semibold">{o.label}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
