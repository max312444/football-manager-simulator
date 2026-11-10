// 컵 대회 화면: 라운드별 대진 · 결과 (순위 화면에서 컵 탭을 고르면 나온다)
import type { Cup, CupTie } from '../../engine/cup';
import { cupProgress, roundName, roundPrize } from '../../engine/cup';
import { clubKo, compKo } from '../../data/db';
import { Crest } from '../components/Crest';
import { koDate, money } from '../format';
import { useWorld } from '../hooks';

export function CupView({ cupId }: { cupId: string }) {
  const w = useWorld();
  const cup = w.cups?.[cupId];
  if (!cup) return <div className="panel grid flex-1 place-items-center text-[13px] text-lo">이번 시즌에는 이 컵 대회가 없습니다</div>;
  const me = cupProgress(cup, w.userClubId);
  const past = (w.cupHistory ?? []).filter((h) => h.cup === cupId && h.season !== cup.season).slice(-5).reverse();
  // 아직 추첨하지 않은 라운드
  const drawn = cup.rounds.length;
  let left = cup.rounds.at(-1)!.ties.length + cup.rounds.at(-1)!.byes.length;
  const future = cup.dates.slice(drawn).map((date) => { const name = roundName(left, false); left /= 2; return { name, date }; });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="panel flex flex-wrap items-center gap-x-8 gap-y-2 px-6 py-4 text-[13px]">
        <div className="text-[16px] font-semibold">{compKo(cupId)} <span className="ml-1 text-[13px] font-normal text-lo">{cup.season.replace('-', '/')} · {cup.entrants.length}개 구단 · 단판 · 비기면 승부차기</span></div>
        {me && <div>내 구단: <span className={me === '우승' ? 'font-semibold text-[#f2c94c]' : me === '준우승' ? 'text-hi' : me.includes('탈락') ? 'text-red' : 'text-neon'}>{me}</span></div>}
        {cup.winner && <div>우승 <span className="font-semibold text-[#f2c94c]">{clubKo(cup.winner)}</span> · 준우승 {clubKo(cup.runnerUp!)}</div>}
        <div className="text-lo">결승 우승 상금 {money(roundPrize(cup, cup.dates.length - 1))} · 라운드 통과마다 상금</div>
        {past.length > 0 && <div className="ml-auto text-lo">지난 우승: {past.map((h) => `${h.season.slice(2, 4)}/${h.season.slice(5)} ${clubKo(h.winner)}`).join(' · ')}</div>}
      </div>
      <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto pb-1">
        {cup.rounds.map((r, i) => <RoundColumn key={i} cup={cup} name={r.name} date={r.date} ties={r.ties} byes={r.byes} />)}
        {future.map((r, i) => (
          <section key={`f${i}`} className="panel flex min-w-[210px] flex-1 flex-col">
            <RoundHead name={r.name} date={r.date} />
            <div className="grid flex-1 place-items-center px-4 text-center text-[12px] text-lo">앞 라운드가 끝나면 추첨</div>
          </section>
        ))}
      </div>
    </div>
  );
}

function RoundHead({ name, date, sub }: { name: string; date: string; sub?: string }) {
  return (
    <div className="shrink-0 border-b border-line px-4 py-3">
      <div className="text-[14px] font-semibold">{name}</div>
      <div className="text-[11px] text-lo">{koDate(date)}{sub ? ` · ${sub}` : ''}</div>
    </div>
  );
}

function RoundColumn({ cup, name, date, ties, byes }: { cup: Cup; name: string; date: string; ties: CupTie[]; byes: string[] }) {
  const w = useWorld();
  const mine = (t: CupTie) => t.home === w.userClubId || t.away === w.userClubId;
  const sorted = [...ties].sort((a, b) => +mine(b) - +mine(a));
  return (
    <section className="panel flex min-w-[210px] flex-1 flex-col">
      <RoundHead name={name} date={date} sub={`${ties.length}경기`} />
      <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
        {sorted.map((t) => {
          const f = cup.fixtures.find((x) => x.id === t.fixture);
          const r = f?.result;
          return (
            <div key={t.fixture} className={`rounded-lg px-3 py-2 ${mine(t) ? 'bg-neon-ghost ring-1 ring-neon/30' : 'bg-ink-900'}`}>
              {[t.home, t.away].map((id, k) => (
                <div key={id} className={`flex items-center gap-2 py-0.5 text-[13px] ${t.winner === id ? 'font-semibold text-hi' : t.winner ? 'text-lo' : 'text-mid'}`}>
                  <Crest clubId={id} size={14} />
                  <span className="min-w-0 flex-1 truncate">{clubKo(id)}</span>
                  {k === 0 && <span className="text-[10px] text-lo">홈</span>}
                  <span className="tnum w-4 text-right">{r ? (k === 0 ? r.homeGoals : r.awayGoals) : ''}</span>
                </div>
              ))}
              {r?.pens && <div className="mt-0.5 text-[11px] text-lo">승부차기 {clubKo(r.pens === 'home' ? t.home : t.away)} 승</div>}
            </div>
          );
        })}
        {byes.length > 0 && (
          <div className="rounded-lg px-3 py-2 text-[12px] text-lo ring-1 ring-line">
            <div className="mb-1 font-semibold">부전승 {byes.length}팀 · 다음 라운드부터</div>
            <div className="leading-relaxed">{byes.map((id) => <span key={id} className={id === w.userClubId ? 'text-neon' : ''}>{clubKo(id)}</span>).reduce<React.ReactNode[]>((a, x, i) => (i ? [...a, ' · ', x] : [x]), [])}</div>
          </div>
        )}
      </div>
    </section>
  );
}
