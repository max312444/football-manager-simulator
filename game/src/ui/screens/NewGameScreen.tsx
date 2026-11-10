import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../store/app';
import { useGame } from '../../store/game';
import { availableSeasons, clubKo, compKo, clubs as clubMasters, dataset, leagues, loadLeagueSeason, playerKo, realAvailable, setDataset } from '../../data/db';
import { overall } from '../../data/rating';
import type { ClubSeasonFile } from '../../data/types';
import { Crest } from '../components/Crest';
import { Icon } from '../components/Icon';
import { money, ratingTone } from '../format';

const fmtSeason = (s: string) => s.replace('-', '/');

export function NewGameScreen() {
  const go = useApp((s) => s.go);
  const setTab = useApp((s) => s.setTab);
  const { newGame, loading } = useGame();

  const top = useMemo(() => leagues.filter((l) => l.level <= 2 && availableSeasons(l.id).length), []);
  const allSeasons = useMemo(() => [...new Set(top.flatMap((l) => availableSeasons(l.id)))].sort(), [top]);

  const [season, setSeason] = useState<string>(allSeasons[allSeasons.length - 1]);
  const lgOptions = top.filter((l) => availableSeasons(l.id).includes(season));
  const [league, setLeague] = useState<string>(lgOptions[0]?.id ?? 'eng1');
  const [clubsData, setClubsData] = useState<ClubSeasonFile[] | null>(null);
  const [club, setClub] = useState<string | null>(null);

  useEffect(() => { if (!lgOptions.some((l) => l.id === league)) setLeague(lgOptions[0]?.id); }, [season]); // eslint-disable-line
  useEffect(() => {
    let alive = true;
    setClubsData(null);
    loadLeagueSeason(season, league).then((r) => {
      if (!alive) return;
      const sorted = [...r.clubs].sort((a, b) => b.reputation - a.reputation);
      setClubsData(sorted);
      setClub((c) => (sorted.some((x) => x.club === c) ? c : sorted[0]?.club ?? null));
    });
    return () => { alive = false; };
  }, [season, league]);

  const strength = (c: ClubSeasonFile) => {
    const t = c.squad.map(overall).sort((a, b) => b - a).slice(0, 11);
    return Math.round(t.reduce((a, b) => a + b, 0) / Math.max(1, t.length));
  };
  const sel = clubsData?.find((c) => c.club === club);

  /** 완전 랜덤: 시즌 · 리그 · 구단 모두 무작위 (첫 시즌만 예산 · 샐러리 캡 보정) */
  const [rolling, setRolling] = useState(false);
  const randomStart = async () => {
    setRolling(true);
    const s = allSeasons[Math.floor(Math.random() * allSeasons.length)];
    const lgs = top.filter((l) => availableSeasons(l.id).includes(s));
    const lg = lgs[Math.floor(Math.random() * lgs.length)];
    const r = await loadLeagueSeason(s, lg.id);
    const c = r.clubs[Math.floor(Math.random() * r.clubs.length)];
    setSeason(s); setLeague(lg.id); setClub(c.club);
    await newGame(s, lg.id, c.club, { random: true });
    setRolling(false);
    setTab('home');
    go('hub');
  };

  const start = async () => {
    if (!club) return;
    await newGame(season, league, club);
    setTab('home');
    go('hub');
  };

  const decades = [['2000년대', '2000', '2009'], ['2010년대', '2010', '2019'], ['2020년대', '2020', '2029']] as const;

  return (
    <div className="flex h-full animate-[fade_0.3s_ease-out] bg-ink-950">
      {/* 왼쪽: 단계 */}
      <aside className="flex w-[260px] shrink-0 flex-col border-r border-line bg-ink-900 px-7 py-8">
        <button onClick={() => go('title')} className="mb-10 flex items-center gap-2 text-[13px] text-lo hover:text-hi">
          <Icon name="back" size={15} /> 메인 메뉴
        </button>
        <h1 className="mt-2 text-[26px] font-semibold">새 게임</h1>
        <button onClick={randomStart} disabled={loading || rolling} title="시즌 · 리그 · 구단을 모두 무작위로 고릅니다"
          className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-neon/50 text-[13px] font-semibold text-neon transition-colors hover:bg-neon-ghost disabled:opacity-50">
          {rolling ? '구단 고르는 중…' : '완전 랜덤으로 시작'}
        </button>
        <div className="mt-1.5 text-[11px] leading-relaxed text-lo">시즌 · 리그 · 구단 모두 무작위 · 첫 시즌만 살짝 보정 (이적 예산 +10% · 주급 예산 +5% · 샐러리 캡 +5%)</div>
        <ol className="mt-10 space-y-6">
          {[['시즌', fmtSeason(season)], ['리그', compKo(league)], ['구단', club ? clubKo(club) : '–']].map(([k, v], i) => (
            <li key={k} className="flex gap-4">
              <span className="tnum mt-0.5 text-[12px] font-semibold text-neon">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <div className="text-[12px] text-lo">{k}</div>
                <div className="text-[15px] font-semibold">{v}</div>
              </div>
            </li>
          ))}
        </ol>
        {realAvailable && (
          <div className="mt-10">
            <div className="mb-2 text-[12px] text-lo">이름 데이터</div>
            <div className="flex gap-1 rounded-lg bg-ink-850 p-1">
              {([['public', '가상 이름'], ['real', '실명 (내 PC)']] as const).map(([k, label]) => (
                <button key={k} onClick={() => k !== dataset && setDataset(k)}
                  className={`h-8 flex-1 rounded-md text-[12px] transition-colors ${dataset === k ? 'bg-ink-700 font-semibold text-hi' : 'text-mid hover:text-hi'}`}>{label}</button>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-lo">실명 데이터는 이 PC에서 파이프라인으로 만든 것이며 저장소에는 없습니다.</p>
          </div>
        )}
        <p className="mt-auto text-[12px] leading-relaxed text-lo">
          고른 시즌의 실제 선수단으로 시작합니다. 7월 1일 프리시즌부터 진행되며, 여름 이적시장이 열려 있습니다.
        </p>
      </aside>

      {/* 가운데: 선택 */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <section className="border-b border-line px-8 pt-7 pb-6">
          <h2 className="mb-4 text-[13px] font-semibold text-mid">시작 시즌</h2>
          <div className="space-y-2.5">
            {decades.map(([label, from, to]) => {
              const list = allSeasons.filter((s) => s.slice(0, 4) >= from && s.slice(0, 4) <= to);
              if (!list.length) return null;
              return (
                <div key={label} className="flex items-center gap-4">
                  <span className="w-16 shrink-0 text-[12px] text-lo">{label}</span>
                  <div className="flex flex-wrap gap-2">
                    {list.map((s) => (
                      <button key={s} onClick={() => setSeason(s)}
                        className={`tnum h-8 rounded-md px-3 text-[13px] transition-colors ${
                          s === season ? 'bg-neon font-semibold text-ink-950' : 'bg-ink-850 text-mid ring-1 ring-line hover:text-hi hover:ring-line-strong'}`}>
                        {fmtSeason(s)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-6 flex gap-2">
            {lgOptions.map((l) => (
              <button key={l.id} onClick={() => setLeague(l.id)}
                className={`h-10 rounded-lg px-5 text-[14px] font-semibold transition-colors ${
                  l.id === league ? 'bg-ink-700 text-hi ring-1 ring-line-strong' : 'bg-ink-850 text-mid ring-1 ring-line hover:text-hi'}`}>
                {l.ko}
              </button>
            ))}
          </div>
        </section>

        <section className="min-h-0 flex-1 overflow-auto px-8 py-6">
          <h2 className="mb-4 text-[13px] font-semibold text-mid">구단 <span className="text-lo">· 명성 순</span></h2>
          {!clubsData ? <div className="text-[13px] text-lo">불러오는 중…</div> : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-2">
              {clubsData.map((c) => {
                const on = c.club === club;
                const st = strength(c);
                return (
                  <button key={c.club} onClick={() => setClub(c.club)}
                    className={`group flex items-center gap-4 rounded-lg p-4 text-left transition-colors ${
                      on ? 'bg-neon-ghost ring-1 ring-line-strong' : 'bg-ink-850 ring-1 ring-line hover:bg-ink-800 hover:ring-line-strong'}`}>
                    <Crest clubId={c.club} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-semibold">{clubKo(c.club)}</div>
                      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-ink-700">
                        <div className={`h-full rounded-full ${on ? 'bg-neon' : 'bg-mid/60'}`} style={{ width: `${c.reputation}%` }} />
                      </div>
                    </div>
                    <div className={`tnum text-[18px] font-semibold ${ratingTone(st)}`}>{st}</div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* 오른쪽: 요약 */}
      <aside className="flex w-[340px] shrink-0 flex-col border-l border-line bg-ink-900">
        {sel ? (
          <>
            <div className="relative overflow-hidden px-7 pt-8 pb-6">
              <div className="absolute -top-10 -right-10 opacity-[0.07]"><Crest clubId={sel.club} size={200} /></div>
              <Crest clubId={sel.club} size={54} />
              <div className="mt-4 text-[24px] font-semibold">{clubKo(sel.club)}</div>
              <div className="text-[13px] text-lo">
                {clubMasters.get(sel.club)?.city ?? ''}{clubMasters.get(sel.club)?.founded ? ` · ${clubMasters.get(sel.club)!.founded}년 창단` : ''}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-px border-y border-line bg-line">
              {[
                ['명성', `${sel.reputation}`],
                ['주전 전력', `${strength(sel)}`],
                ['이적 예산', money(sel.finance.transferBudget)],
                ['주급 예산', money(sel.finance.wageBudget)],
                ['선수단', `${sel.squad.length}명`],
                ['경기장', sel.stadiumCapacity ? `${sel.stadiumCapacity.toLocaleString()}석` : '–'],
              ].map(([k, v]) => (
                <div key={k} className="bg-ink-900 px-6 py-4">
                  <div className="text-[11px] text-lo">{k}</div>
                  <div className="tnum mt-0.5 text-[15px] font-semibold">{v}</div>
                </div>
              ))}
            </div>
            <div className="flex-1 overflow-auto px-7 py-5">
              <div className="mb-3 text-[11px] font-semibold text-lo">핵심 선수</div>
              {[...sel.squad].sort((a, b) => overall(b) - overall(a)).slice(0, 6).map((p) => (
                <div key={p.id} className="flex items-center gap-3 py-1.5 text-[13px]">
                  <span className="w-9 text-[11px] font-semibold text-lo">{p.pos}</span>
                  <span className="flex-1 truncate">{playerKo(p.id, p.name)}</span>
                  <span className={`tnum font-semibold ${ratingTone(overall(p))}`}>{overall(p)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-line p-5">
              <button onClick={start} disabled={loading}
                className="group flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-neon text-[15px] font-semibold text-ink-950 transition-colors hover:bg-[#5bff3d] disabled:opacity-60">
                {loading ? '세계를 만드는 중…' : '감독 커리어 시작'}
                {!loading && <Icon name="arrow" size={18} className="transition-transform" />}
              </button>
            </div>
          </>
        ) : null}
      </aside>
    </div>
  );
}
