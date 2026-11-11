import type { GameEvent, World } from '../../engine/types';
import { clubKo, compKo, nationKo, playerKo } from '../../data/db';
import { josa, koDate, money } from '../format';
import { useWorld } from '../hooks';
import { boardEventText } from '../components/BoardEventModal';
import { SCANDAL_KO, SCANDAL_TITLE } from '../../engine/scandal';
import { COMP_TONE, compKind } from '../components/bits';

export function describe(e: GameEvent, w: World): { tag: string; tone: string; title: string; body?: string } {
  switch (e.type) {
    case 'match': {
      const mineHome = e.home === w.userClubId;
      const [g, o] = mineHome ? e.score : [e.score[1], e.score[0]];
      const res = g > o ? '승리' : g === o ? '무승부' : '패배';
      const k = compKind({ league: e.league }, w);
      return { tag: k === 'league' || k === 'po' ? '경기' : COMP_TONE[k].short, tone: g > o ? 'text-neon' : g === o ? 'text-mid' : 'text-red', title: `${clubKo(e.home)} ${e.score[0]} - ${e.score[1]} ${clubKo(e.away)}`, body: `${res} · ${compKo(e.league) ?? ''}` };
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
    case 'callup': {
      const names = e.players.map((id) => playerKo(id, w.players[id]?.name ?? id));
      const hurt = e.injured.map((id) => playerKo(id, w.players[id]?.name ?? id));
      return { tag: '대표', tone: hurt.length ? 'text-amber' : 'text-sky', title: `A매치 기간 · 대표팀 차출 ${names.length}명`, body: `${names.join(', ')} · 체력이 떨어져 돌아옵니다${hurt.length ? ` · 부상: ${hurt.join(', ')}` : ''}` };
    }
    case 'worldcup': {
      const cup = compKo('wc');
      const mine = (e.players ?? []).map((id) => `${playerKo(id, w.players[id]?.name ?? id)}(${nationKo(w.players[id]?.nation ?? '')})`);
      if (e.result === 'start') return { tag: '월드컵', tone: 'text-sky', title: `${e.year} ${cup} 대표 선발 · 우리 선수 ${mine.length}명`, body: mine.join(', ') };
      return { tag: '월드컵', tone: 'text-[#f2c94c]', title: `${e.year} ${cup} 우승 · ${nationKo(e.nation)}`, body: [mine.length ? `우승 멤버: ${mine.join(', ')}` : '', e.scorer ? `득점왕 ${playerKo(e.scorer, e.text ?? '')}` : e.text ?? ''].filter(Boolean).join(' · ') };
    }
    case 'scout': {
      if (e.league) return { tag: '스카우트', tone: 'text-sky', title: `${compKo(e.league)} 관찰 보고서 도착`, body: `선수 ${e.count ?? 0}명의 능력치 범위가 좁아지고 숨은 성향이 보이게 됐습니다` };
      const p = e.player ? w.players[e.player] : null;
      return { tag: '스카우트', tone: 'text-sky', title: `스카우트 보고서 · ${p ? playerKo(p.id, p.name) : ''}`, body: `${p?.clubId ? clubKo(p.clubId) + ' · ' : ''}정확한 능력치와 숨은 성향을 선수 정보에서 볼 수 있습니다` };
    }
    case 'coach':
      return { tag: '감독', tone: 'text-mid', title: `${clubKo(e.club)} 감독 ${e.when === 'season' ? '경질' : '교체'}`, body: e.when === 'season' ? '성적 부진으로 경질 · 새 감독 부임 (전술 성향이 바뀝니다)' : '시즌을 마치고 새 감독 선임 (전술 성향이 바뀝니다)' };
    case 'loan': {
      const name = playerKo(e.player, w.players[e.player]?.name ?? e.player);
      if (e.kind === 'start') return { tag: '임대', tone: 'text-sky', title: `${name} 임대 · ${clubKo(e.from)} → ${clubKo(e.to)}`, body: `이번 시즌 끝까지 · 주급 ${Math.round((e.share ?? 1) * 100)}% 부담${e.fee ? ` · 임대료 ${money(e.fee)}` : ''}` };
      if (e.kind === 'bought') return { tag: '이적', tone: 'text-neon', title: `${name} 완전 영입 · ${clubKo(e.from)} → ${clubKo(e.to)}`, body: `완전 영입 옵션 ${money(e.fee ?? 0)}` };
      return { tag: '임대', tone: 'text-mid', title: `${name} 임대 종료 · ${clubKo(e.to)} 복귀` };
    }
    case 'scandal': {
      const name = playerKo(e.player, w.players[e.player]?.name ?? e.player);
      return { tag: '논란', tone: 'text-red', title: `${name} · ${SCANDAL_TITLE[e.kind]}`, body: SCANDAL_KO[e.kind] };
    }
    case 'saga': {
      const name = playerKo(e.player, w.players[e.player]?.name ?? e.player);
      const what = e.kind === 'wage' ? '연봉 인상 요구' : `이적 요청${e.target ? ` (${clubKo(e.target)})` : ''}`;
      if (e.step === 'resolved') return { tag: '선수', tone: 'text-neon', title: `${name} · 연봉 문제가 해결됐습니다`, body: '요구 주급 이상으로 재계약' };
      if (e.step === 'forced') return { tag: '이적', tone: 'text-sky', title: `${name}, 태업 끝에 ${clubKo(e.target ?? '')} 이적`, body: `${clubKo(e.from ?? '')}가 결국 ${money(e.fee ?? 0)}에 팔았습니다` };
      if (e.step === 'wantsUs') return { tag: '이적', tone: 'text-neon', title: `${name}: "${clubKo(e.target ?? '')}에서 뛰고 싶다"`, body: `${clubKo(e.from ?? '')} 소속 · 태업이 길어질수록 원래 구단이 싸게 팝니다 (이적 화면에서 영입 제안)` };
      const stage = ['에이전트 발언', '공개 인터뷰', '훈련 불참', '출전 거부'][e.stage] ?? '';
      return { tag: '선수', tone: e.stage >= 2 ? 'text-red' : 'text-amber', title: `${name} · ${what} · ${stage}`, body: '선수단 화면에서 선수를 눌러 대응할 수 있습니다' };
    }
    case 'press':
      return { tag: '언론', tone: 'text-sky', title: e.kind === 'pre' ? `경기 전 기자회견${e.opp ? ` · 상대 ${clubKo(e.opp)}` : ''}` : `경기 후 기자회견${e.opp ? ` · ${clubKo(e.opp)}전` : ''}`, body: '답변 결과는 아래 소식에 나옵니다' };
    case 'board': {
      const t = boardEventText(w, e.kind, e.player);
      const owner = e.kind === 'ownerRich' || e.kind === 'ownerCut';
      return { tag: owner ? '구단' : e.kind === 'rumour' ? '언론' : e.kind === 'protest' ? '팬' : '이사회', tone: e.kind === 'ownerRich' ? 'text-neon' : 'text-amber', title: t.title, body: owner ? t.body : '선택한 결과는 아래 소식에 나옵니다' };
    }
    case 'manager': {
      const c = clubKo(e.club);
      const names = (e.players ?? []).map((id) => playerKo(id, w.players[id]?.name ?? id)).join(', ');
      switch (e.kind) {
        case 'offer': return { tag: '감독', tone: 'text-sky', title: `${c}에서 감독 제안이 왔습니다`, body: '구단 메뉴 · 감독 카드에서 수락하거나 거절하세요 (3주 안에)' };
        case 'renew': return { tag: '감독', tone: 'text-neon', title: `이사회가 ${e.years}년 재계약을 제안했습니다`, body: '구단 메뉴 · 감독 카드에서 수락하거나 거절하세요' };
        case 'norenew': return { tag: '감독', tone: 'text-amber', title: '이사회가 재계약하지 않기로 했습니다', body: '시즌이 끝나면 계약이 만료됩니다 · 다른 구단 제안을 받아 보세요' };
        case 'renewed': return { tag: '감독', tone: 'text-neon', title: `${c}와 ${e.years}년 재계약했습니다` };
        case 'sacked': return { tag: '감독', tone: 'text-red', title: `${c} 감독직에서 경질됐습니다`, body: '새로 맡을 구단을 고르세요' };
        case 'expired': return { tag: '감독', tone: 'text-amber', title: `${c}와 계약이 끝났습니다`, body: '새로 맡을 구단을 고르세요' };
        case 'moved': return { tag: '감독', tone: 'text-neon', title: `${c} 감독으로 부임했습니다`, body: e.from ? `전 구단: ${clubKo(e.from)}` : undefined };
        case 'follow': return { tag: '감독', tone: 'text-sky', title: `${names} — 감독님을 따라가고 싶어 합니다`, body: `${c} 소속 · 이적시장이 열리면 시장가로 영입을 시도합니다` };
        case 'followDone': return { tag: '이적', tone: 'text-neon', title: `${names}이(가) 감독님을 따라 ${clubKo(w.userClubId)}에 합류했습니다`, body: `이적료 ${money(e.fee ?? 0)}` };
        case 'followFail': return { tag: '이적', tone: 'text-amber', title: `${names} 영입 무산`, body: `이적료 ${money(e.fee ?? 0)} · 예산 또는 재정 규정 때문에 데려올 수 없었습니다` };
      }
      return { tag: '감독', tone: 'text-mid', title: c };
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
