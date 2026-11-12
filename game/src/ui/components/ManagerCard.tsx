// 감독 카드 (구단 메뉴): 계약 · 이사회 신뢰도 · 감독 명성 · 받은 제안 (수락 · 거절) · 다른 구단 제안 받기 · 감독 경력
// + 새 구단 고르기 창 (경질 · 계약 만료 때, 고를 때까지 진행 멈춤)
import { useState } from 'react';
import { confidenceLabel, ensureManager } from '../../engine/manager';
import { approvalChance, askCooldown, budgetFactor, relationLabel, relationOf, type BoardAsk } from '../../engine/board';
import { clubRevenue } from '../../engine/finance';
import { fanMoodLabel, fanMoodOf } from '../../engine/boardEvents';
import { overall } from '../../engine/ratings';
import { clubKo, compKo } from '../../data/db';
import { useGame } from '../../store/game';
import { useApp } from '../../store/app';
import { koDate, money } from '../format';
import { useWorld } from '../hooks';
import { Card } from './bits';
import { Crest } from './Crest';

const season = (d: string) => `${d.slice(2, 4)}.${d.slice(5, 7)}`;

export function ManagerCard() {
  const w = useWorld();
  const m = w.manager ?? ensureManager(w);
  const { managerAccept, managerDecline, managerSetOpen } = useGame();
  const left = (Date.parse(m.contract) - Date.parse(w.date)) / (365.25 * 864e5);
  const tone = m.confidence >= 60 ? 'bg-neon' : m.confidence >= 40 ? 'bg-amber' : 'bg-red';
  return (
    <Card title="감독" action={
      <label className="flex cursor-pointer items-center gap-2 text-[11px] text-lo" title="켜 두면 다른 구단 제안이 더 자주 옵니다">
        다른 구단 제안 받기
        <input type="checkbox" checked={!!m.open} onChange={(e) => managerSetOpen(e.target.checked)} className="accent-[#39ff14]" />
      </label>}>
      <div className="space-y-4 px-5 py-4 text-[13px]">
        <div className="grid grid-cols-2 gap-4">
          <div><div className="text-[12px] text-lo">계약</div><div className="tnum mt-1 font-semibold">{koDate(m.contract).replace(/\s*\(.\)$/, '')}까지</div><div className={`text-[11px] ${left < 1 ? 'text-amber' : 'text-lo'}`}>남은 기간 {Math.max(0, left).toFixed(1)}년</div></div>
          <div><div className="text-[12px] text-lo">감독 명성</div><div className="tnum mt-1 font-semibold">{m.reputation}</div><div className="text-[11px] text-lo">제안 오는 구단 수준</div></div>
        </div>
        <div>
          <div className="mb-1 flex justify-between text-[12px]"><span className="text-lo">이사회 신뢰도</span><span className="font-semibold">{confidenceLabel(m.confidence)} <span className="tnum text-lo">{Math.round(m.confidence)}</span></span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-ink-700"><div className={`h-full rounded-full ${tone}`} style={{ width: `${m.confidence}%` }} /></div>
          <div className="mt-1 text-[11px] text-lo">순위가 목표보다 높으면 오르고 낮으면 떨어집니다 · 너무 낮으면 경질</div>
        </div>
        <FanMood />
        <BoardRelation />
        {m.offers.length > 0 && (
          <div className="space-y-2">
            <div className="text-[12px] text-lo">받은 제안</div>
            {m.offers.map((o, i) => (
              <div key={o.club + o.date} className="flex items-center gap-3 rounded-lg bg-ink-900 px-3 py-2.5">
                <Crest clubId={o.club} size={20} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{o.kind === 'renew' ? `재계약 ${o.years}년` : clubKo(o.club)}</div>
                  <div className="truncate text-[11px] text-lo">{o.kind === 'renew' ? '이사회 제안' : `${compKo(w.clubs[o.club]?.league ?? '')} · 명성 ${w.clubs[o.club]?.reputation ?? '–'}`} · {koDate(o.until).replace(/\s*\(.\)$/, '')}까지</div>
                </div>
                <button onClick={() => managerDecline(i)} className="h-8 rounded-md px-3 text-[12px] text-lo ring-1 ring-line hover:text-hi">거절</button>
                <button onClick={() => managerAccept(i)} className="h-8 rounded-md bg-neon px-3 text-[12px] font-semibold text-ink-950">수락</button>
              </div>
            ))}
            {m.offers.some((o) => o.kind === 'offer') && <div className="text-[11px] text-lo">다른 구단 제안을 수락하면 바로 그 구단으로 옮깁니다. 오래 함께한 선수 중 몇 명이 따라오고 싶어 할 수 있습니다.</div>}
          </div>
        )}
        <div>
          <div className="mb-1.5 text-[12px] text-lo">감독 경력</div>
          {[...m.history].reverse().map((h) => (
            <div key={h.club + h.from} className="flex items-center gap-2 py-1">
              <Crest clubId={h.club} size={14} />
              <span className="min-w-0 flex-1 truncate">{clubKo(h.club)}</span>
              {h.titles?.length ? <span className="text-[11px] text-[#f2c94c]">우승 {h.titles.length}</span> : null}
              <span className="tnum text-[11px] text-lo">{season(h.from)} – {h.to ? season(h.to) : '현재'}{h.why === 'sacked' ? ' · 경질' : ''}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function FanMood() {
  const w = useWorld();
  const v = fanMoodOf(w);
  const tone = v >= 60 ? 'bg-neon' : v >= 40 ? 'bg-amber' : 'bg-red';
  return (
    <div>
      <div className="mb-1 flex justify-between text-[12px]"><span className="text-lo">팬 여론</span><span className="font-semibold">{fanMoodLabel(v)} <span className="tnum text-lo">{Math.round(v)}</span></span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-ink-700"><div className={`h-full rounded-full ${tone}`} style={{ width: `${v}%` }} /></div>
      <div className="mt-1 text-[11px] text-lo">경기 결과 · 영입 · 판매로 바뀝니다 · 높으면 이사회가 쉽게 경질하지 못하고, 낮으면 이사회 관계가 나빠집니다</div>
    </div>
  );
}

/** 이사회 관계 · 예산 영향 · 요청 (추가 이적 · 주급 예산, 찬성 확률) */
function BoardRelation() {
  const w = useWorld();
  const boardAsk = useGame((s) => s.boardAsk);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const rel = relationOf(w);
  const f = budgetFactor(w);
  const c = w.clubs[w.userClubId];
  const rev = clubRevenue(w, c.id);
  const asks: { label: string; a: BoardAsk }[] = [
    { label: `이적 예산 +${money(Math.round((rev * 0.05) / 1e6) * 1e6)}`, a: { kind: 'transfer', amount: Math.round((rev * 0.05) / 1e6) * 1e6 } },
    { label: `이적 예산 +${money(Math.round((rev * 0.12) / 1e6) * 1e6)}`, a: { kind: 'transfer', amount: Math.round((rev * 0.12) / 1e6) * 1e6 } },
    { label: `주급 예산 +${money(Math.round((c.finance.wageBudget * 0.08) / 1e3) * 1e3)}/주`, a: { kind: 'wage', amount: Math.round((c.finance.wageBudget * 0.08) / 1e3) * 1e3 } },
  ];
  const tone = rel >= 60 ? 'bg-sky' : rel >= 40 ? 'bg-amber' : 'bg-red';
  return (
    <div>
      <div className="mb-1 flex justify-between text-[12px]"><span className="text-lo">이사회 관계</span><span className="font-semibold">{relationLabel(rel)} <span className="tnum text-lo">{Math.round(rel)}</span></span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-ink-700"><div className={`h-full rounded-full ${tone}`} style={{ width: `${rel}%` }} /></div>
      <div className="mt-1 text-[11px] text-lo">새 시즌 예산 {f >= 1 ? '+' : ''}{Math.round((f - 1) * 100)}% · 요청이 거절되면 나빠지고, 성적 · 우승으로 좋아집니다</div>
      <div className="mt-2.5 text-[12px] text-lo">이사회에 요청</div>
      <div className="mt-1.5 space-y-1.5">
        {asks.map(({ label, a }) => {
          const cd = askCooldown(w, a.kind);
          const p = Math.round(approvalChance(w, a) * 100);
          return (
            <div key={label} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">{label}</span>
              <span className={`tnum text-[11px] ${p >= 60 ? 'text-neon' : p >= 35 ? 'text-amber' : 'text-red'}`}>찬성 {p}%</span>
              <button disabled={!!cd} title={cd ?? ''} onClick={() => { const r = boardAsk(a); setMsg({ t: r.text, ok: r.ok }); }}
                className="h-7 rounded-md px-2.5 text-[11px] font-semibold ring-1 ring-line hover:text-hi disabled:opacity-40">요청</button>
            </div>
          );
        })}
      </div>
      {msg && <div className={`mt-1.5 text-[11px] ${msg.ok ? 'text-neon' : 'text-red'}`}>{msg.t}</div>}
    </div>
  );
}

const REASON = { sacked: '이사회가 감독님을 경질했습니다', expired: '계약이 끝났습니다', declined: '재계약하지 않고 계약이 끝났습니다' } as const;

/** 새 구단 고르기 (경질 · 계약 만료) */
export function JobModal() {
  const w = useWorld();
  const job = w.manager?.pendingJob;
  const managerChoose = useGame((s) => s.managerChoose);
  if (!job) return null;
  const pick = (c: string) => { managerChoose(c); useApp.getState().setTab('club'); };
  const str = (c: string) => { const top = w.clubs[c].squad.map((id) => overall(w.players[id])).sort((a, b) => b - a).slice(0, 11); return Math.round(top.reduce((a, b) => a + b, 0) / Math.max(1, top.length)); };
  return (
    <div className="fixed inset-0 z-[70] grid animate-[fade_0.2s_ease-out] place-items-center bg-ink-950/90 p-2 sm:p-6 backdrop-blur-sm">
      <div className="panel w-full max-w-[560px] overflow-hidden">
        <div className="px-4 sm:px-7 pt-7 pb-4">
          <div className="text-[12px] text-lo">{clubKo(w.userClubId)}</div>
          <h2 className="mt-1 text-[20px] font-semibold">{REASON[job.reason]}</h2>
          <div className="mt-1 text-[13px] text-mid">감독님을 원하는 구단이 있습니다. 새로 맡을 구단을 고르세요.</div>
        </div>
        <div className="space-y-2 px-4 sm:px-7 pb-7">
          {job.clubs.map((c) => (
            <button key={c} onClick={() => pick(c)} className="flex w-full items-center gap-4 rounded-xl bg-ink-900 px-4 py-3 text-left transition-colors hover:bg-ink-800">
              <Crest clubId={c} size={32} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold">{clubKo(c)}</div>
                <div className="truncate text-[12px] text-lo">{compKo(w.clubs[c].league)} · 명성 {w.clubs[c].reputation} · 주전 전력 {str(c)}</div>
              </div>
              <span className="text-[12px] font-semibold text-neon">맡기</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
