import type { GameEvent, World } from '../../engine/types';
import { clubKo, leagues, playerKo } from '../../data/db';
import { koDate } from '../format';
import { useWorld } from '../hooks';

export function describe(e: GameEvent, w: World): { tag: string; tone: string; title: string; body?: string } {
  switch (e.type) {
    case 'match': {
      const mineHome = e.home === w.userClubId;
      const [g, o] = mineHome ? e.score : [e.score[1], e.score[0]];
      const res = g > o ? '승리' : g === o ? '무승부' : '패배';
      return { tag: '경기', tone: g > o ? 'text-neon' : g === o ? 'text-mid' : 'text-red', title: `${clubKo(e.home)} ${e.score[0]} - ${e.score[1]} ${clubKo(e.away)}`, body: `${res} · ${leagues.find((l) => l.id === e.league)?.ko ?? ''}` };
    }
    case 'injury':
      return { tag: '부상', tone: 'text-red', title: `${playerKo(e.player, w.players[e.player]?.name ?? e.player)} 부상`, body: `${e.label} · 약 ${e.days}일 결장 예상` };
    case 'seasonEnd':
      return { tag: '시즌', tone: 'text-amber', title: `${leagues.find((l) => l.id === e.league)?.ko} 시즌 종료`, body: `우승: ${clubKo(e.champion)}` };
    default:
      return { tag: '알림', tone: 'text-mid', title: e.text };
  }
}

export function InboxView() {
  const w = useWorld();
  const list = [...w.inbox].reverse();
  return (
    <div className="h-full p-6">
      <div className="panel h-full overflow-auto">
        {list.length === 0 && <div className="grid h-full place-items-center text-[13px] text-lo">아직 받은 소식이 없습니다. "계속"을 눌러 시즌을 진행하세요.</div>}
        {list.map((e, i) => {
          const d = describe(e, w);
          return (
            <div key={i} className="flex items-center gap-5 px-6 py-3.5 shadow-[inset_0_-1px_0_var(--color-line)]">
              <span className={`w-10 text-[12px] font-bold ${d.tone}`}>{d.tag}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold">{d.title}</div>
                {d.body && <div className="truncate text-[12px] text-lo">{d.body}</div>}
              </div>
              <span className="tnum text-[12px] text-lo">{koDate(e.date)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
