import type { GameEvent, World } from '../../engine/types';
import { clubKo, compKo, playerKo } from '../../data/db';
import { josa, koDate, money } from '../format';
import { useWorld } from '../hooks';

export function describe(e: GameEvent, w: World): { tag: string; tone: string; title: string; body?: string } {
  switch (e.type) {
    case 'match': {
      const mineHome = e.home === w.userClubId;
      const [g, o] = mineHome ? e.score : [e.score[1], e.score[0]];
      const res = g > o ? '승리' : g === o ? '무승부' : '패배';
      return { tag: '경기', tone: g > o ? 'text-neon' : g === o ? 'text-mid' : 'text-red', title: `${clubKo(e.home)} ${e.score[0]} - ${e.score[1]} ${clubKo(e.away)}`, body: `${res} · ${compKo(e.league) ?? ''}` };
    }
    case 'injury':
      return { tag: '부상', tone: 'text-red', title: `${playerKo(e.player, w.players[e.player]?.name ?? e.player)} 부상`, body: `${e.label} · 약 ${e.days}일 결장 예상` };
    case 'seasonEnd':
      return { tag: '시즌', tone: 'text-amber', title: `${compKo(e.league)} 시즌 종료`, body: `우승: ${clubKo(e.champion)}` };
    case 'transfer': {
      const name = playerKo(e.player, w.players[e.player]?.name ?? e.player);
      const from = e.from ? clubKo(e.from) : '자유계약';
      return { tag: '이적', tone: e.user ? 'text-neon' : 'text-sky', title: `${name} · ${from} → ${clubKo(e.to)}`, body: e.fee > 0 ? `이적료 ${money(e.fee)}` : '이적료 없음 (자유계약)' };
    }
    case 'offer':
      return { tag: '제안', tone: 'text-amber', title: `${playerKo(e.player, w.players[e.player]?.name ?? e.player)} 영입 제안 · ${clubKo(e.from)}`, body: `이적료 ${money(e.fee)} · 이적 화면 '받은 제안'에서 수락 · 거절 · 역제안` };
    case 'retire': {
      const name = playerKo(e.player, w.players[e.player]?.name ?? e.player);
      return { tag: '은퇴', tone: e.club === w.userClubId ? 'text-neon' : 'text-amber', title: `${e.season.replace('-', '/')} 시즌을 끝으로 ${name}${josa(name, '은', '는')} 은퇴하기로 하였습니다`, body: e.club ? `마지막 소속: ${clubKo(e.club)}` : undefined };
    }
    case 'contract':
      return { tag: '계약', tone: 'text-amber', title: `재계약 요청 · ${e.players.length}명`, body: `${e.players.map((id) => playerKo(id, w.players[id]?.name ?? id)).join(', ')} · ${koDate(e.until)} 만료. 직접 재계약하지 않으면 자유계약으로 떠납니다 (선수단 화면에서 재계약)` };
    case 'renewed':
      return { tag: '계약', tone: 'text-neon', title: `자동 재계약 · ${e.players.length}명`, body: e.players.map((id) => { const p = w.players[id]; return p ? `${playerKo(id, p.name)} (${p.contract?.slice(0, 4)}년까지)` : id; }).join(', ') };
    case 'leave': {
      const name = playerKo(e.player, w.players[e.player]?.name ?? e.player);
      const mine = !e.club || e.club === w.userClubId;
      return { tag: '계약', tone: mine ? 'text-red' : 'text-amber', title: `${name}${josa(name, '이', '가')} 계약 만료로 ${mine ? '팀을' : `${clubKo(e.club!)}${josa(clubKo(e.club!), '을', '를')}`} 떠났습니다`, body: mine ? '재계약하지 않아 자유계약(FA) 선수가 됐습니다' : '자유계약(FA) 선수가 됐습니다 · 이적 화면 FA 목록에서 영입할 수 있습니다' };
    }
    case 'cup': {
      const cup = compKo(e.cup);
      if (e.result === 'champion') {
        const mine = e.club === w.userClubId;
        return { tag: '컵', tone: mine ? 'text-[#f2c94c]' : 'text-amber', title: `${cup} 우승 · ${clubKo(e.club)}`, body: mine ? `결승 승리 · 상금 ${money(e.prize ?? 0)}` : undefined };
      }
      if (e.result === 'through') return { tag: '컵', tone: 'text-neon', title: `${cup} ${e.round} 통과`, body: e.prize ? `상금 ${money(e.prize)}` : undefined };
      return { tag: '컵', tone: 'text-red', title: `${cup} ${e.round}${e.round === '결승' ? ' 패배 · 준우승' : ' 탈락'}` };
    }
    case 'youth': {
      const names = e.players.map((id) => playerKo(id, w.players[id]?.name ?? id));
      const star = e.star ? playerKo(e.star, w.players[e.star]?.name ?? e.star) : null;
      return { tag: '유스', tone: star ? 'text-[#f2c94c]' : 'text-neon', title: `유스 선수 ${e.players.length}명 입단${star ? ` · 코치진이 ${star}${josa(star, '을', '를')} 주목합니다` : ''}`, body: names.join(', ') };
    }
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
            <div key={i} className="flex items-center gap-5 px-6 py-4 shadow-[inset_0_-1px_0_var(--color-line)]">
              <span className={`w-10 text-[12px] font-semibold ${d.tone}`}>{d.tag}</span>
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
