// 이적시장 마감 알림 (데드라인 데이): 마감 3일 전 · 마감 당일 팝업
import { useGame } from '../../store/game';
import { useApp } from '../../store/app';
import { useWorld } from '../hooks';
import { koDate } from '../format';

export function DeadlineAlert() {
  const w = useWorld();
  const clear = useGame((s) => s.clearDeadline);
  const blocked = useGame((s) => !!s.match || !!s.seasonReport || !!s.awards || !!s.news || !!s.ceremony);
  const setTab = useApp((s) => s.setTab);
  const d = w.deadlineAlert;
  if (!d || blocked || w.pendingRenewals?.length) return null;
  const name = d.window === 'summer' ? '여름' : '겨울';
  const today = d.left === 0;
  return (
    <div className="fixed inset-0 z-[48] grid animate-[fade_0.2s_ease-out] place-items-center bg-ink-950/80 p-2 sm:p-6 backdrop-blur-sm">
      <div className="panel w-full max-w-[460px] overflow-hidden">
        <div className="px-6 pt-6 pb-5 text-center">
          <div className={`mx-auto mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12px] font-semibold ${today ? 'bg-red/15 text-red' : 'bg-amber/15 text-amber'}`}>
            <span className={`h-2 w-2 rounded-full ${today ? 'bg-red' : 'bg-amber'}`} />{today ? '데드라인 데이' : `D-${d.left}`}
          </div>
          <h2 className="text-[20px] font-semibold">{today ? `오늘 ${name} 이적시장이 마감됩니다` : `${name} 이적시장 마감이 얼마 남지 않았습니다`}</h2>
          <p className="mt-2 text-[13px] text-lo">
            {today ? '오늘이 지나면 다음 이적시장까지 다른 구단 선수를 영입하거나 팔 수 없습니다. 다른 구단들도 막판 영입에 나섭니다.'
              : `${koDate(d.end)}에 마감됩니다 (${d.left}일 남음). 영입 · 판매 · 임대는 그 전에 마무리하세요.`}
          </p>
        </div>
        <div className="flex gap-2 border-t border-line px-6 py-4">
          <button onClick={clear} className="h-11 flex-1 rounded-lg bg-ink-700 text-[14px] font-semibold text-hi hover:bg-ink-750">닫기</button>
          <button onClick={() => { clear(); setTab('transfers'); }} className="h-11 flex-1 rounded-lg bg-neon text-[14px] font-semibold text-ink-950 hover:bg-[#5bff3d]">이적시장 보기</button>
        </div>
      </div>
    </div>
  );
}
