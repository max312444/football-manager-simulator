// 월드컵 화면: 조별리그 순위 · 녹아웃 · 지난 대회 (순위 화면 '대회' 줄에서 월드컵 탭)
import { sortTable } from '../../engine/standings';
import { nationOfNT, type WcTie } from '../../engine/worldcup';
import { clubKo, compKo, nationKo, playerKo } from '../../data/db';
import { koDate } from '../format';
import { useWorld } from '../hooks';

export function WorldCupView() {
  const w = useWorld();
  const wc = w.worldCup;
  const past = [...(w.worldCupHistory ?? [])].filter((h) => h.year !== wc?.year).reverse().slice(0, 6);
  if (!wc) {
    return (
      <div className="panel flex-1 px-6 py-5 text-[13px]">
        <div className="text-lo">이번 시즌에는 {compKo('wc')}가 없습니다 (4년마다 시즌이 끝난 6~7월).</div>
        {past.length > 0 && <div className="mt-3">지난 대회: {past.map((h) => `${h.year} ${nationKo(h.winner)}`).join(' · ')}</div>}
      </div>
    );
  }
  // 내 구단 선수가 뽑힌 대표팀
  const mineIn = (nt: string) => (w.clubs[nt]?.squad ?? []).filter((id) => w.players[id]?.clubId === w.userClubId);
  const myNations = wc.squads ? wc.groups.flatMap((g) => g.teams).filter((t) => mineIn(t).length) : [];
  const fx = new Map(wc.fixtures.map((f) => [f.id, f]));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
      <div className="panel flex flex-wrap items-center gap-x-8 gap-y-2 px-6 py-4 text-[13px]">
        <div className="text-[16px] font-semibold">{wc.year} {compKo('wc')} <span className="ml-1 text-[13px] font-normal text-lo">{wc.size}개국 · 개최 {wc.hosts.map(nationKo).join(' · ')} · {koDate(wc.dates.group[0])} 개막{wc.real ? ' · 실제 참가국 · 조' : ' · 참가국은 대표팀 전력으로'}</span></div>
        {wc.winner && <div>우승 <span className="font-semibold text-[#f2c94c]">{clubKo(wc.winner)}</span> · 준우승 {clubKo(wc.runnerUp!)}{wc.third ? ` · 3위 ${clubKo(wc.third)}` : ''}</div>}
        {wc.topScorer && <div>득점왕 {playerKo(wc.topScorer.player, w.players[wc.topScorer.player]?.name ?? '')} {wc.topScorer.goals}골</div>}
        {!wc.squads && <div className="text-lo">대표 선발 {koDate(wc.dates.squad)}</div>}
        {myNations.length > 0 && <div className="text-neon">우리 선수: {myNations.map((t) => `${nationKo(nationOfNT(t))} ${mineIn(t).length}명`).join(' · ')}</div>}
        {past.length > 0 && <div className="ml-auto text-lo">지난 대회: {past.map((h) => `${h.year} ${nationKo(h.winner)}`).join(' · ')}</div>}
      </div>

      <div className="grid shrink-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {wc.groups.map((g) => (
          <section key={g.name} className="panel px-4 py-3">
            <div className="mb-1.5 text-[13px] font-semibold">{g.name}조</div>
            <table className="w-full table-fixed text-[12px]">
              <tbody>
                {sortTable(g.table).map((r, i) => (
                  <tr key={r.club} className={`${mineIn(r.club).length ? 'text-neon' : ''} ${i < 2 ? '' : 'text-mid'}`}>
                    <td className="w-5 py-0.5"><span className={`mr-1 inline-block h-2.5 w-0.5 rounded align-middle ${i < 2 ? 'bg-neon' : i === 2 && wc.size === 48 ? 'bg-sky' : 'bg-transparent'}`} /></td>
                    <td className="truncate">{nationKo(nationOfNT(r.club))}</td>
                    <td className="tnum w-7 text-right text-lo">{r.p}</td>
                    <td className="tnum w-9 text-right text-lo">{r.gf - r.ga > 0 ? `+${r.gf - r.ga}` : r.gf - r.ga}</td>
                    <td className="tnum w-7 text-right font-semibold">{r.pts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>

      <div className="grid shrink-0 grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {wc.knockout.length === 0 ? <div className="panel col-span-full py-6 text-center text-[12px] text-lo">조별리그가 끝나면 {wc.size === 48 ? '32강' : '16강'} 대진이 정해집니다 ({koDate(wc.dates.ko[0])})</div>
          : wc.knockout.map((r) => (
            <section key={r.name} className="panel flex flex-col">
              <div className="border-b border-line px-3 py-2"><div className="text-[13px] font-semibold">{r.name}</div><div className="text-[11px] text-lo">{koDate(fx.get(r.ties[0].fixture)!.date)}</div></div>
              <div className="space-y-1.5 p-2">{r.ties.map((t) => <Tie key={t.fixture} t={t} />)}</div>
            </section>
          ))}
      </div>
    </div>
  );

  function Tie({ t }: { t: WcTie }) {
    const f = fx.get(t.fixture)!;
    const s = f.result;
    return (
      <div className="rounded-md bg-ink-900 px-2.5 py-1.5 text-[12px]">
        {[t.a, t.b].map((id) => (
          <div key={id} className={`flex items-center gap-2 ${t.winner === id ? 'font-semibold text-hi' : t.winner ? 'text-lo' : 'text-mid'} ${mineIn(id).length ? 'text-neon' : ''}`}>
            <span className="min-w-0 flex-1 truncate">{nationKo(nationOfNT(id))}</span>
            <span className="tnum">{s ? (id === f.home ? s.homeGoals : s.awayGoals) : ''}</span>
          </div>
        ))}
        {s?.pens && <div className="text-[10px] text-lo">승부차기 {nationKo(nationOfNT(s.pens === 'home' ? f.home : f.away))} 승</div>}
      </div>
    );
  }
}
