// 선수 논란 대응 창 (게임이 만든 가벼운 논란)
import { SCANDAL_KO, SCANDAL_TITLE, type ScandalAction } from '../../engine/scandal';
import { playerKo } from '../../data/db';
import { useGame } from '../../store/game';
import { useWorld } from '../hooks';

export function ScandalModal() {
  const w = useWorld();
  const s = w.scandalPrompt;
  const respond = useGame((g) => g.scandalRespond);
  if (!s || w.manager?.pendingJob || w.manager?.boardEvent) return null;
  const p = w.players[s.player];
  if (!p) return null;
  const name = playerKo(p.id, p.name);
  const other = s.other ? playerKo(s.other, w.players[s.other]?.name ?? '') : '';
  const opts: { a: ScandalAction; label: string; hint: string }[] = [
    ...(s.kind === 'teammate' ? [{ a: 'mediate' as ScandalAction, label: '두 선수를 불러 화해시킨다', hint: '두 선수 사기 +' }] : []),
    { a: 'defend', label: '선수를 감싼다', hint: '선수 사기 · 충성도 + · 가벼운 논란이 아니면 팬 여론 · 이사회 관계 조금 −' },
    { a: 'fine', label: '내부 징계 (벌금)', hint: '선수 사기 − · 다른 선수 사기 + · 이사회 관계 +' },
    { a: 'criticize', label: '공개적으로 비판한다', hint: '팬 여론 + · 선수 사기 · 충성도 크게 −' },
    { a: 'ignore', label: '무시한다', hint: '조용히 지나갈 수도, 언론이 더 크게 다룰 수도 있음' },
  ];
  return (
    <div className="fixed inset-0 z-[62] grid animate-[fade_0.2s_ease-out] place-items-center bg-ink-950/85 p-6 backdrop-blur-sm">
      <div className="panel w-full max-w-[540px] overflow-hidden">
        <div className="px-7 pt-7 pb-4">
          <div className="flex justify-between text-[12px]"><span className="font-semibold text-red">선수 논란 · {SCANDAL_TITLE[s.kind]}</span><span className="text-lo">게임 속 사건</span></div>
          <h2 className="mt-2 text-[19px] leading-snug font-semibold">{name}{s.kind === 'teammate' && other ? ` · ${other}` : ''}</h2>
          <div className="mt-1.5 text-[13px] text-mid">{SCANDAL_KO[s.kind]}{p.scandals && p.scandals > 1 ? ` (이번이 ${p.scandals}번째 논란)` : ''}</div>
        </div>
        <div className="space-y-1.5 px-7 pb-6">
          {opts.map((o) => (
            <button key={o.a} onClick={() => respond(o.a, o.label)} className="w-full rounded-xl bg-ink-900 px-4 py-2.5 text-left transition-colors hover:bg-ink-800">
              <div className="text-[14px] font-semibold">{o.label}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
