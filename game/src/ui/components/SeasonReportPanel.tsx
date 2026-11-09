// 시즌 전환 결산: 우승 · 내 순위 · 강등/승격 · 새 선수 · 은퇴
import { useGame } from '../../store/game';
import { useWorld } from '../hooks';
import { clubKo, leagues, playerKo } from '../../data/db';
import { overall } from '../../engine/ratings';
import { Crest } from './Crest';
import { Icon } from './Icon';
import { useApp } from '../../store/app';
import { analyzeClub, searchPreset } from '../../engine/analysis';

export function SeasonReportPanel() {
  const w = useWorld();
  const r = useGame((s) => s.seasonReport);
  const dismiss = useGame((s) => s.dismissReport);
  const openTransfers = useApp((s) => s.openTransfers);
  const awardsOpen = useGame((s) => !!s.awards || !!s.news);
  if (!r || awardsOpen) return null;
  // 새 시즌 선수단 기준 분석 (실제 데이터로 능력치가 갱신된 뒤)
  const analysis = analyzeClub(w, w.userClubId);
  const myLeague = w.clubs[w.userClubId].league;
  const myRec = w.history.find((h) => h.season === r.from && h.league === myLeague);
  const myPos = myRec ? myRec.table.findIndex((t) => t.club === w.userClubId) + 1 : null;
  const myPts = myRec?.table.find((t) => t.club === w.userClubId)?.pts;
  const debutsMine = r.debuts.filter((id) => w.players[id]?.clubId === w.userClubId);
  const notableDebuts = [...r.debuts].filter((id) => w.players[id]?.clubId).sort((a, b) => overall(w.players[b]) - overall(w.players[a])).slice(0, 6);
  const lgName = (id: string) => leagues.find((l) => l.id === id)?.ko ?? id;

  return (
    <div className="fixed inset-0 z-50 grid animate-[fade_0.2s_ease-out] place-items-center bg-ink-950/80 p-8 backdrop-blur-sm">
      <div className="panel flex max-h-full w-full max-w-[960px] flex-col overflow-hidden">
        <header className="flex items-end justify-between border-b border-line px-8 py-6">
          <div>
            <div className="text-[12px] text-lo">시즌 결산</div>
            <div className="mt-1 text-[24px] font-semibold">{r.from.replace('-', '/')} → {r.to.replace('-', '/')}</div>
          </div>
          {myPos && (
            <div className="text-right">
              <div className="text-[12px] text-lo">{clubKo(w.userClubId)} 최종 성적</div>
              <div className="tnum mt-1 text-[24px] font-semibold">{myPos}위 <span className="text-[14px] font-normal text-mid">· 승점 {myPts}</span></div>
            </div>
          )}
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-px overflow-auto bg-line md:grid-cols-2">
          <section className="bg-ink-850 px-8 py-6 md:col-span-2">
            <h3 className="mb-2 text-[13px] font-semibold text-mid">새 시즌 구단 분석</h3>
            <p className="text-[15px] leading-relaxed">{analysis.summary}</p>
            {analysis.priorities.length > 0 && (
              <div className="mt-4 grid gap-2 md:grid-cols-3">
                {analysis.priorities.map((p, i) => {
                  const pr = searchPreset(p);
                  return (
                    <div key={p.unit.key} className="rounded-lg bg-ink-800 px-4 py-3">
                      <div className="flex items-center justify-between"><span className="text-[14px] font-semibold">{i + 1}. {p.unit.label}</span><span className="tnum text-[12px] text-lo">주전 {p.starterAvg.toFixed(0)} / 비교 {p.benchmark.toFixed(0)}</span></div>
                      <ul className="mt-2 space-y-1 text-[12px] text-mid">{p.notes.slice(0, 2).map((n) => <li key={n}>· {n}</li>)}</ul>
                      <button onClick={() => { openTransfers(pr); dismiss(); }} className="mt-3 h-8 w-full rounded-md bg-ink-700 text-[12px] font-semibold text-hi transition-colors hover:bg-ink-750">
                        이 포지션 찾기 · 능력 {pr.minOvr}+
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
          <section className="bg-ink-850 px-8 py-6">
            <h3 className="mb-4 text-[13px] font-semibold text-mid">리그 우승</h3>
            <div className="space-y-3">
              {Object.entries(r.champions).map(([lg, c]) => {
                const top = w.history.find((h) => h.season === r.from && h.league === lg)?.topScorer;
                return (
                  <div key={lg} className="flex items-center gap-3">
                    <Crest clubId={c} size={24} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-medium">{clubKo(c)}</div>
                      <div className="truncate text-[12px] text-lo">{lgName(lg)}{top ? ` · 득점왕 ${playerKo(top.player, w.players[top.player]?.name ?? top.player)} ${top.goals}골` : ''}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="bg-ink-850 px-8 py-6">
            <h3 className="mb-4 text-[13px] font-semibold text-mid">강등 · 승격</h3>
            <div className="space-y-4">
              {Object.keys(r.relegated).map((lg) => (
                <div key={lg}>
                  <div className="mb-2 text-[12px] text-lo">{lgName(lg)}</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-2 text-[13px]">
                    {r.relegated[lg].map((c) => <span key={c} className="flex items-center gap-2 text-mid"><span className="text-red">▼</span>{clubKo(c)}</span>)}
                    {r.promoted[lg].map((c) => <span key={c} className="flex items-center gap-2"><span className="text-neon">▲</span>{clubKo(c)}</span>)}
                    {!r.relegated[lg].length && !r.promoted[lg].length && <span className="text-lo">변동 없음</span>}
                  </div>
                </div>
              ))}
              {!Object.keys(r.relegated).length && <div className="text-[13px] text-lo">실제 데이터가 끝난 시즌이라 리그 구성이 그대로 유지됩니다</div>}
              {r.userKept && <div className="text-[12px] text-amber">강등권이었지만 2부 리그가 아직 없어 잔류 처리됐습니다</div>}
            </div>
          </section>

          <section className="bg-ink-850 px-8 py-6">
            <h3 className="mb-4 text-[13px] font-semibold text-mid">새로 등장한 선수 <span className="font-normal text-lo">· {r.debuts.length}명</span></h3>
            {notableDebuts.map((id) => { const p = w.players[id]; return (
              <div key={id} className="flex items-center gap-3 py-1.5 text-[13px]">
                <Crest clubId={p.clubId!} size={18} />
                <span className="flex-1 truncate">{playerKo(id, p.name)}</span>
                <span className="text-[12px] text-lo">{clubKo(p.clubId!)}</span>
                <span className="tnum w-6 text-right font-medium">{overall(p)}</span>
              </div>
            ); })}
            {debutsMine.length > 0 && <div className="mt-3 text-[12px] text-neon">내 구단에 합류: {debutsMine.map((id) => playerKo(id, w.players[id].name)).join(', ')}</div>}
          </section>

          <section className="bg-ink-850 px-8 py-6">
            <h3 className="mb-4 text-[13px] font-semibold text-mid">선수 변동</h3>
            <dl className="grid grid-cols-2 gap-4 text-[13px]">
              <div><dt className="text-[12px] text-lo">실제 능력치로 갱신</dt><dd className="tnum mt-1 text-[18px] font-semibold">{r.updated.toLocaleString()}명</dd></div>
              <div><dt className="text-[12px] text-lo">성장 엔진 적용</dt><dd className="tnum mt-1 text-[18px] font-semibold">{r.aged.toLocaleString()}명</dd></div>
              <div><dt className="text-[12px] text-lo">은퇴</dt><dd className="tnum mt-1 text-[18px] font-semibold">{r.retired.length}명</dd></div>
              <div><dt className="text-[12px] text-lo">계약 만료로 FA</dt><dd className="tnum mt-1 text-[18px] font-semibold">{r.released.length}명</dd></div>
            </dl>
            {(r.userLeft ?? []).length > 0 && (
              <div className="mt-4 rounded-lg bg-ink-900 px-4 py-3 text-[13px]">
                <div className="mb-1 text-[12px] font-semibold text-amber">내 구단을 떠난 선수</div>
                {r.userLeft.map((x) => <div key={x.player} className="flex justify-between"><span>{playerKo(x.player, w.players[x.player]?.name ?? x.player)}</span><span className="text-lo">{x.why === 'retire' ? '은퇴' : '계약 만료'}</span></div>)}
              </div>
            )}
            <p className="mt-4 text-[12px] leading-relaxed text-lo">능력치는 그 시즌 실제 데이터를 따르고, 소속은 게임 세계를 따릅니다. 내 구단 선수는 재계약하지 않으면 계약이 끝날 때 자유계약(FA)으로 떠납니다.</p>
          </section>
        </div>

        <footer className="flex justify-end border-t border-line px-8 py-5">
          <button onClick={dismiss} className="flex h-11 items-center gap-2 rounded-lg bg-neon px-6 text-[14px] font-semibold text-ink-950 transition-colors hover:bg-[#5bff3d]">
            새 시즌 시작 <Icon name="arrow" size={17} />
          </button>
        </footer>
      </div>
    </div>
  );
}
