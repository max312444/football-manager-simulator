// 이벤트(기자회견 · 이사회 · 선수 논란 · 언론 플레이) 를 고른 뒤 같은 자리에 이어서 보여 주는 결과
import { useGame } from '../../store/game';

export function EventResultModal() {
  const r = useGame((s) => s.eventResult);
  const close = useGame((s) => s.closeEventResult);
  if (!r) return null;
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-ink-950/85 p-6 backdrop-blur-sm">
      <div className="panel w-full max-w-[540px] animate-[fade_0.2s_ease-out] overflow-hidden">
        <div className="px-7 pt-7 pb-5">
          <div className={`text-[12px] font-semibold ${r.tone}`}>{r.tag}</div>
          {r.choice && <h2 className="mt-2 text-[17px] leading-snug font-semibold">{r.choice}</h2>}
          <ul className="mt-3 space-y-1.5 text-[14px] text-mid">
            {r.lines.map((l, i) => <li key={i} className="flex gap-2"><span className="mt-[8px] h-1 w-1 shrink-0 rounded-full bg-neon/70" />{l}</li>)}
          </ul>
        </div>
        <div className="border-t border-line px-7 py-3 text-right">
          <button autoFocus onClick={close} className="rounded-md bg-neon px-5 py-2 text-[13px] font-semibold text-ink-950">{r.next ?? '확인'}</button>
        </div>
      </div>
    </div>
  );
}
