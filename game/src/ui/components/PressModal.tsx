// 기자회견 창: 질문 하나씩, 답변 3개 + 불참
import { clubKo, playerKo } from '../../data/db';
import { useGame } from '../../store/game';
import { useWorld } from '../hooks';

export function PressModal() {
  const w = useWorld();
  const conf = w.manager?.press;
  const answer = useGame((s) => s.pressAnswer);
  const result = useGame((s) => s.eventResult);
  if (result) return null;
  if (!conf || w.manager?.pendingJob || w.manager?.boardEvent) return null;
  const q = conf.questions[0];
  if (!q) return null;
  const p = q.player ? w.players[q.player] : null;
  const text = q.text.replace('{player}', p ? playerKo(p.id, p.name) : '선수');
  const head = conf.kind === 'pre' ? `경기 전 기자회견${conf.opp ? ` · 상대 ${clubKo(conf.opp)}` : ''}` : conf.kind === 'post' ? `경기 후 기자회견${conf.opp ? ` · ${clubKo(conf.opp)}전` : ''}` : '기자회견';
  return (
    <div className="fixed inset-0 z-[64] grid animate-[fade_0.2s_ease-out] place-items-center bg-ink-950/85 p-2 sm:p-6 backdrop-blur-sm">
      <div className="panel w-full max-w-[560px] overflow-hidden">
        <div className="px-4 sm:px-7 pt-7 pb-4">
          <div className="flex items-center justify-between text-[12px]"><span className="font-semibold text-sky">{head}</span><span className="text-lo">질문 {conf.questions.length}개 남음</span></div>
          <h2 className="mt-2 text-[18px] leading-snug font-semibold">기자: "{text}"</h2>
        </div>
        <div className="space-y-2 px-4 sm:px-7 pb-4">
          {q.answers.map((a) => (
            <button key={a.key} onClick={() => answer(a.key)} className="w-full rounded-xl bg-ink-900 px-4 py-3 text-left transition-colors hover:bg-ink-800">
              <div className="text-[14px] font-semibold">{a.label}</div>
            </button>
          ))}
        </div>
        <div className="border-t border-line px-4 sm:px-7 py-3 text-right">
          <button onClick={() => answer('skip')} className="text-[12px] text-lo hover:text-hi">기자회견 불참</button>
        </div>
      </div>
    </div>
  );
}
