// 뉴스 화면: 리그 전체 소식 · 이적 소문 (출처 신뢰도 ★, 진행 · 사실 · 무산)
import { useMemo, useState } from 'react';
import type { NewsItem } from '../../engine/news';
import type { World } from '../../engine/types';
import { clubKo, playerKo } from '../../data/db';
import { useApp } from '../../store/app';
import { useWorld } from '../hooks';
import { Crest } from '../components/Crest';
import { money } from '../format';

type Filter = 'all' | 'rumour' | 'transfer' | 'mine';
const name = (w: World, id?: string) => (id ? playerKo(id, w.players[id]?.name ?? id) : '');

/** 뉴스 한 줄의 글 (태그 · 제목 · 설명 · 색) */
export function newsText(w: World, n: NewsItem): { tag: string; tone: string; title: string; body?: string } {
  const p = name(w, n.player);
  const from = n.from ? clubKo(n.from) : '자유계약';
  switch (n.kind) {
    case 'rumour': return { tag: '소문', tone: 'text-sky', title: `${clubKo(n.to!)}, ${p} 영입에 관심`, body: `${from} 소속 · 출처 신뢰도 ${'★'.repeat(n.stars ?? 1)}${'☆'.repeat(5 - (n.stars ?? 1))}` };
    case 'transfer': return { tag: '이적', tone: 'text-neon', title: `${p} · ${from} → ${clubKo(n.to!)}`, body: n.fee ? `이적료 ${money(n.fee)}` : '이적료 없음' };
    case 'buyout': return { tag: '바이아웃', tone: 'text-red', title: `${clubKo(n.to!)}, ${p}의 바이아웃 지불`, body: `${money(n.fee ?? 0)} · ${from}는 거절할 수 없었습니다` };
    case 'bosman': return { tag: '보스만', tone: 'text-amber', title: `${p}, ${clubKo(n.to!)}와 사전 계약`, body: '계약이 끝나는 여름에 이적료 없이 합류합니다' };
    case 'firesale': return { tag: '급매물', tone: 'text-red', title: `${from}, 재정 위기로 ${p} 매물로`, body: `시장 가치보다 싼 ${money(n.fee ?? 0)}` };
    case 'releg': return { tag: '급매물', tone: 'text-red', title: `${p}의 강등 조항 발동`, body: `${from} 강등 · ${money(n.fee ?? 0)}이면 거절할 수 없습니다` };
    case 'coach': return { tag: '감독', tone: 'text-mid', title: `${clubKo(n.club!)} 감독 ${n.text === 'season' ? '경질' : '교체'}` };
    case 'deadline': return { tag: '데드라인', tone: 'text-amber', title: `데드라인 데이 결산: 이적 ${n.count}건`, body: `총 이적료 ${money(n.fee ?? 0)}` };
  }
}

function StatusChip({ n }: { n: NewsItem }) {
  if (n.kind !== 'rumour') return null;
  const s = n.status ?? 'open';
  const [label, cls] = s === 'true' ? ['사실로 확인', 'bg-neon-ghost text-neon'] : s === 'false' ? ['무산', 'bg-ink-800 text-lo'] : ['진행 중', 'bg-sky/15 text-sky'];
  return <span className={`shrink-0 rounded px-1.5 py-px text-[11px] font-semibold ${cls}`}>{label}</span>;
}

export function NewsRow({ w, n, onPlayer }: { w: World; n: NewsItem; onPlayer?: (id: string) => void }) {
  const t = newsText(w, n);
  const crest = n.kind === 'coach' ? n.club : n.to ?? n.from ?? undefined;
  return (
    <button onClick={() => n.player && onPlayer?.(n.player)} className="flex w-full items-start gap-3 px-4 py-3 text-left shadow-[inset_0_-1px_0_var(--color-line)] transition-colors hover:bg-ink-800 lg:px-5">
      <span className={`w-14 shrink-0 pt-0.5 text-[12px] font-semibold ${t.tone}`}>{t.tag}</span>
      {crest ? <Crest clubId={crest} size={20} /> : <span className="w-5" />}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2"><span className="truncate text-[14px] font-medium">{t.title}</span><StatusChip n={n} /></span>
        {t.body && <span className="block truncate text-[12px] text-lo">{t.body}</span>}
      </span>
      <span className="tnum shrink-0 pt-0.5 text-[12px] text-lo">{n.date.slice(5).replace('-', '.')}</span>
    </button>
  );
}

const mineOf = (w: World, n: NewsItem) => n.from === w.userClubId || n.to === w.userClubId || n.club === w.userClubId;

export function NewsView() {
  const w = useWorld();
  const openProfile = useApp((s) => s.openProfile);
  const [f, setF] = useState<Filter>('all');
  const list = useMemo(() => [...(w.news ?? [])].reverse().filter((n) =>
    f === 'all' ? true : f === 'rumour' ? n.kind === 'rumour' : f === 'transfer' ? n.kind !== 'rumour' : mineOf(w, n)), [w, f, w.news?.length]);
  const open = (w.news ?? []).filter((n) => n.kind === 'rumour' && n.status === 'open').length;
  return (
    <div className="flex h-full min-h-0 flex-col p-3 lg:p-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 overflow-x-auto">
          {([['all', '전체'], ['rumour', `이적 소문${open ? ` ${open}` : ''}`], ['transfer', '이적 · 소식'], ['mine', '내 구단']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setF(k)} className={`h-8 shrink-0 rounded-md px-3 text-[13px] whitespace-nowrap transition-colors lg:px-4 ${f === k ? 'bg-ink-700 font-semibold text-hi' : 'text-mid hover:bg-ink-800 hover:text-hi'}`}>{label}</button>
          ))}
        </div>
        <span className="text-[12px] text-lo max-sm:basis-full">소문은 출처 신뢰도(★)가 높을수록 사실일 가능성이 큽니다</span>
      </div>
      <div className="panel min-h-0 flex-1 overflow-auto">
        {list.length === 0 && <div className="grid h-full min-h-[200px] place-items-center px-6 text-center text-[13px] text-lo">아직 소식이 없습니다. 이적 소문은 이적시장 기간과 그 직전(6월 · 12월)에 돕니다.</div>}
        {list.map((n) => <NewsRow key={n.id} w={w} n={n} onPlayer={(id) => openProfile(id)} />)}
      </div>
    </div>
  );
}
