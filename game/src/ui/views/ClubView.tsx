// 구단 화면: 구단 정보 · 우승 기록 · 시즌별 순위 · 이사회 기대 · 구단 역대 기록
import { MyManagerCard } from '../components/ManagerProfile';
import { ManagerCard } from '../components/ManagerCard';
import { useEffect, useMemo, useState } from 'react';
import { FACILITY_KO, facilityLevel, upgradeCost, type FacilityKind } from '../../engine/facilities';
import { approvalChance } from '../../engine/board';
import { useGame } from '../../store/game';
import type { World } from '../../engine/types';
import { sortTable } from '../../engine/standings';
import { levelOf } from '../../engine/pyramid';
import { fansOf } from '../../engine/awards';
import { availableSeasons, clubKo, clubs as clubMasters, compKo, leagues, loadStandings, nationKo, playerKo } from '../../data/db';
import { Crest } from '../components/Crest';
import { COMP_TONE, Card } from '../components/bits';
import { isCup } from '../../engine/cup';
import { money } from '../format';
import { useWorld } from '../hooks';
import { objective, strength } from './HomeView';

/** 한 시즌 최종 순위 (real = 게임 시작 전 실제 기록, 아니면 이 세이브에서 치른 시즌) */
export interface SeasonPlace { season: string; league: string; pos: number; teams: number; pts?: number; real: boolean; /** 진행 중인 이번 시즌 */ now?: boolean }

/** 게임 시작 시즌: 게임 속 기록이 있는 가장 이른 시즌 */
const startSeasonOf = (w: World) => [w.season, ...w.history.map((h) => h.season)].sort()[0];

/** 게임 속 시즌 순위 */
export function gamePlaces(w: World, club: string): SeasonPlace[] {
  return w.history.flatMap((h) => {
    const t = h.table;   // 시즌 기록은 이미 최종 순위 순서
    const i = t.findIndex((r) => r.club === club);
    return i < 0 ? [] : [{ season: h.season, league: h.league, pos: i + 1, teams: t.length, pts: t[i].pts, real: false }];
  });
}

/** 게임 시작 전 실제 순위 (데이터에 수록된 시즌만, 같은 나라 1 · 2부) */
async function realPlaces(nation: string, club: string, before: string): Promise<SeasonPlace[]> {
  const ids = leagues.filter((l) => l.nation === nation).map((l) => l.id);
  const jobs = ids.flatMap((lg) => availableSeasons(lg).filter((s) => s < before).map(async (s) => {
    const st = await loadStandings(s, lg);
    const i = st?.indexOf(club) ?? -1;
    return st && i >= 0 ? { season: s, league: lg, pos: i + 1, teams: st.length, real: true } as SeasonPlace : null;
  }));
  return (await Promise.all(jobs)).filter((x): x is SeasonPlace => !!x);
}

const signed = (v: number) => (v < 0 ? `-${money(-v)}` : money(v));
const season = (s: string) => s.replace('-', '/');

export function ClubView() {
  const w = useWorld();
  const id = w.userClubId;
  const club = w.clubs[id];
  const master = clubMasters.get(id);
  const start = startSeasonOf(w);
  const [real, setReal] = useState<SeasonPlace[] | null>(null);
  useEffect(() => {
    let alive = true;
    setReal(null);
    if (master) realPlaces(master.nation, id, start).then((r) => alive && setReal(r)).catch(() => alive && setReal([]));
    else setReal([]);
    return () => { alive = false; };
  }, [id, start, master]);

  const table = w.competitions[club.league] ? sortTable(w.competitions[club.league].table) : [];
  const started = table.some((r) => r.p > 0);
  const pos = table.findIndex((r) => r.club === id) + 1;
  const places = useMemo(() => {
    const done = [...(real ?? []), ...gamePlaces(w, id)];
    // 이번 시즌 (개막했으면 현재 순위로)
    if (started && pos > 0 && !done.some((p) => p.season === w.season)) done.push({ season: w.season, league: club.league, pos, teams: table.length, pts: table[pos - 1].pts, real: false, now: true });
    return done.sort((a, b) => a.season.localeCompare(b.season));
  }, [real, w, id, started, pos, table, club.league]);
  const played2 = places.some((p) => levelOf(p.league) === 2);

  // 우승: 리그 (1부 · 2부) + 컵 · 유럽 대회 (게임 속). 진행 중 시즌 순위는 빼고
  const titles = places.filter((p) => p.pos === 1 && !p.now);
  const cupWins = (w.cupHistory ?? []).filter((h) => h.winner === id);
  const trophyRows: { label: string; tone: string; seasons: { s: string; real?: boolean }[] }[] = [
    { label: '1부 리그 우승', tone: 'text-[#f2c94c]', seasons: titles.filter((p) => levelOf(p.league) === 1).map((p) => ({ s: p.season, real: p.real })) },
    ...(played2 ? [{ label: '2부 리그 우승', tone: 'text-mid', seasons: titles.filter((p) => levelOf(p.league) === 2).map((p) => ({ s: p.season, real: p.real })) }] : []),
    ...['ucl', 'uel'].map((c) => ({ label: `${compKo(c)} 우승`, tone: COMP_TONE[c as 'ucl' | 'uel'].text, seasons: cupWins.filter((h) => h.cup === c).map((h) => ({ s: h.season })) })),
    { label: '국내 컵 우승', tone: COMP_TONE.cup.text, seasons: cupWins.filter((h) => isCup(h.cup)).map((h) => ({ s: h.season })) },
  ];

  // 이사회 기대
  const ids = Object.keys(w.competitions[club.league]?.table ?? {});
  const rank = [...ids].sort((a, b) => strength(w, b) - strength(w, a)).indexOf(id) + 1;
  const o = objective(rank, ids.length, levelOf(club.league));

  return (
    <div className="h-full overflow-auto p-6">
      <section className="panel mb-6 flex flex-wrap items-center gap-x-10 gap-y-4 px-8 py-6">
        <div className="flex items-center gap-5">
          <Crest clubId={id} size={64} />
          <div>
            <div className="text-[24px] font-semibold">{clubKo(id)}</div>
            <div className="mt-1 text-[13px] text-mid">
              {[master?.founded && `${master.founded}년 창단`, master?.city && /[가-힣]/.test(master.city) ? master.city : null, master && nationKo(master.nation), compKo(club.league)].filter(Boolean).join(' · ')}
            </div>
          </div>
        </div>
        <div className="ml-auto grid grid-cols-2 gap-x-10 gap-y-3 sm:grid-cols-4">
          <Stat k="명성" v={String(club.reputation)} />
          <Stat k="팬" v={`${(fansOf(w, id) / 1e6).toFixed(2)}M 명`} />
          <Stat k="경기장" v={club.stadium ? `${club.stadium.toLocaleString()}석` : '–'} />
          <Stat k="우승" v={`${trophyRows.reduce((a, r) => a + r.seasons.length, 0)}회`} gold />
        </div>
      </section>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-6">
          <Card title="우승 기록">
            <div className="divide-y divide-line">
              {trophyRows.map((r) => (
                <div key={r.label} className="px-5 py-3.5">
                  <div className="flex items-baseline justify-between">
                    <span className={`text-[13px] font-semibold ${r.seasons.length ? r.tone : 'text-lo'}`}>{r.label}</span>
                    <span className={`tnum text-[18px] font-semibold ${r.seasons.length ? '' : 'text-lo'}`}>{r.seasons.length}</span>
                  </div>
                  {r.seasons.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {r.seasons.map((x) => <span key={x.s} title={x.real ? '실제 기록' : '게임 속 기록'} className={`tnum rounded px-1.5 py-0.5 text-[11px] ${x.real ? 'bg-ink-700 text-mid' : 'bg-neon/10 text-neon'}`}>{season(x.s)}</span>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="px-5 py-3 text-[11px] text-lo shadow-[inset_0_1px_0_var(--color-line)]">
              <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-ink-700 align-middle" /> 실제 기록 (데이터 수록 시즌만)
              <span className="mr-1 ml-3 inline-block h-2 w-2 rounded-sm bg-neon/40 align-middle" /> 이 게임에서 딴 우승
            </div>
          </Card>

          <Card title="구단 정보">
            <div className="space-y-4 px-5 py-4 text-[13px]">
              <Facility kind="training" />
              <Facility kind="youth" />
              <div className="text-[11px] text-lo">훈련 시설은 매달 훈련 성장 폭, 유스 시설은 유스 선수 잠재력 · 에이스가 나올 확률에 영향을 줍니다</div>
              {master?.rivals?.length ? (
                <div>
                  <div className="mb-2 text-[12px] text-lo">라이벌</div>
                  <div className="flex flex-wrap gap-2">
                    {master.rivals.map((r) => <span key={r} className="flex items-center gap-1.5 rounded-md bg-ink-900 px-2 py-1 text-[12px]"><Crest clubId={r} size={14} />{clubKo(r)}</span>)}
                  </div>
                </div>
              ) : null}
            </div>
          </Card>
        </div>

        <Card title="시즌별 순위" action={<span className="text-[11px] text-lo">{real === null ? '불러오는 중…' : `${places.length}시즌`}</span>}>
          <PlaceChart places={places} />
          <div className="max-h-[520px] overflow-auto">
            {[...places].reverse().map((p) => {
              const lv = levelOf(p.league);
              return (
                <div key={p.season + p.league} className="flex items-center gap-3 px-5 py-2 text-[13px] shadow-[inset_0_-1px_0_var(--color-line)]">
                  <span className="tnum w-14 text-lo">{season(p.season)}{p.now && <span className="block text-[10px] text-neon">진행 중</span>}</span>
                  <span className={`w-9 rounded py-0.5 text-center text-[11px] font-semibold ${lv === 1 ? 'bg-ink-700 text-hi' : 'bg-ink-800 text-lo'}`}>{lv}부</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-800">
                    <div className={`h-full rounded-full ${p.pos === 1 && !p.now ? 'bg-[#f2c94c]' : lv === 1 ? 'bg-neon/70' : 'bg-mid/50'}`} style={{ width: `${Math.max(4, ((p.teams - p.pos + 1) / p.teams) * 100)}%` }} />
                  </div>
                  <span className={`tnum w-12 text-right font-semibold ${p.pos === 1 && !p.now ? 'text-[#f2c94c]' : ''}`}>{p.pos}위</span>
                  <span className="tnum w-12 text-right text-[12px] text-lo">{p.pts != null ? `${p.pts}점` : ''}</span>
                  <span className={`h-1.5 w-1.5 rounded-full ${p.real ? 'bg-ink-700' : 'bg-neon'}`} title={p.real ? '실제 기록' : '게임 속 기록'} />
                </div>
              );
            })}
            {places.length === 0 && <div className="px-5 py-6 text-[13px] text-lo">{real === null ? '기록을 불러오는 중입니다' : '아직 기록이 없습니다'}</div>}
          </div>
        </Card>

        <div className="flex flex-col gap-6">
          <MyManagerCard />
          <ManagerCard />
          <Card title="이사회 기대">
            <div className="px-5 py-5">
              <div className="text-[20px] font-semibold">{o.goal}</div>
              <div className="text-[13px] text-mid">{o.detail} · 주전 전력 {rank}위 / {ids.length}</div>
              <div className={`mt-3 text-[13px] ${!started ? 'text-lo' : pos <= o.target ? 'text-neon' : 'text-amber'}`}>
                {!started ? '시즌 개막 전' : `현재 ${pos}위 · ${pos <= o.target ? '목표권' : '목표 밖'}`}
              </div>
            </div>
          </Card>
          <Card title="재정 요약">
            <div className="grid grid-cols-2 gap-4 px-5 py-5">
              <Stat k="잔고" v={signed(club.finance.balance)} warn={club.finance.balance < 0} />
              <Stat k="연 매출 (기준)" v={club.finance.revenue ? money(club.finance.revenue) : '–'} />
              <Stat k="이적 예산" v={money(Math.max(0, club.finance.transferBudget))} />
              <Stat k="주급 예산" v={`${money(club.finance.wageBudget)}/주`} />
            </div>
          </Card>
          <ClubRecords w={w} club={id} />
        </div>
      </div>
    </div>
  );
}

function Stat({ k, v, gold, warn }: { k: string; v: string; gold?: boolean; warn?: boolean }) {
  return <div><div className="text-[12px] text-lo">{k}</div><div className={`tnum mt-1 text-[18px] font-semibold ${gold ? 'text-[#f2c94c]' : warn ? 'text-red' : ''}`}>{v}</div></div>;
}

/** 시설 단계 · 공사 · 투자 버튼 */
function Facility({ kind }: { kind: FacilityKind }) {
  const w = useWorld();
  const club = w.clubs[w.userClubId];
  const upgrade = useGame((s) => s.upgradeFacility);
  const [err, setErr] = useState('');
  const v = facilityLevel(club, kind);
  const b = club.building?.find((x) => x.kind === kind);
  const u = upgradeCost(w, club.id, kind);
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="w-20 text-[12px] text-lo">{FACILITY_KO[kind]}</span>
        <div className="flex gap-1">{[1, 2, 3, 4, 5].map((i) => <span key={i} className={`h-2 w-6 rounded-sm ${i <= v ? 'bg-neon/80' : b && i === b.level ? 'animate-pulse bg-amber/60' : 'bg-ink-700'}`} />)}</div>
        <span className="tnum whitespace-nowrap text-[12px] text-mid">{v} / 5</span>
        {b ? <span className="ml-auto whitespace-nowrap text-[11px] text-amber">공사 중 · {b.done.slice(2).replace(/-/g, '.')} 완료</span>
          : u ? <button onClick={() => { const r = upgrade(kind); setErr(r.ok ? '' : r.reason ?? ''); }} title={`${u.next}단계로 · 공사 ${u.days}일 · 이사회 승인이 필요합니다`}
            className={`ml-auto h-7 rounded-md px-2.5 text-[11px] font-semibold ring-1 ${club.finance.balance >= u.cost ? 'text-neon ring-neon/40 hover:bg-neon-ghost' : 'text-lo ring-line'}`}>올리기 {money(u.cost)} · 찬성 {Math.round(approvalChance(w, { kind: 'facility', facility: kind }) * 100)}%</button>
          : <span className="ml-auto text-[11px] text-lo">최고 단계</span>}
      </div>
      {err && <div className="mt-1 text-right text-[11px] text-red">{err}</div>}
    </div>
  );
}

/** 시즌별 순위 그래프: 위쪽이 1위, 2부 시즌은 아래 칸 */
function PlaceChart({ places }: { places: SeasonPlace[] }) {
  if (places.length < 2) return null;
  const W = 400, H = 120, pad = 8;
  // 1부 1~20위 → 0~0.66, 2부 1~24위 → 0.7~1
  const two = places.some((p) => levelOf(p.league) === 2);
  const y = (p: SeasonPlace) => {
    const r = (p.pos - 1) / Math.max(1, p.teams - 1);
    return pad + (!two ? r : levelOf(p.league) === 1 ? r * 0.64 : 0.7 + r * 0.3) * (H - pad * 2);
  };
  const x = (i: number) => pad + (i / (places.length - 1)) * (W - pad * 2);
  const pts = places.map((p, i) => `${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(' ');
  return (
    <div className="px-5 pt-4 pb-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[120px] w-full" preserveAspectRatio="none">
        {two && <rect x={0} y={pad + 0.67 * (H - pad * 2)} width={W} height={H} fill="var(--color-ink-900)" />}
        <polyline points={pts} fill="none" stroke="var(--color-mid)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
        {places.map((p, i) => <circle key={i} cx={x(i)} cy={y(p)} r={p.pos === 1 && !p.now ? 3.2 : 2} fill={p.pos === 1 && !p.now ? '#f2c94c' : p.real ? 'var(--color-mid)' : 'var(--color-neon)'} vectorEffect="non-scaling-stroke" />)}
      </svg>
      <div className="flex justify-between text-[10px] text-lo"><span>{season(places[0].season)}</span><span>{two ? '위 = 1부 · 아래 회색 칸 = 2부' : '위로 갈수록 높은 순위'}</span><span>{season(places[places.length - 1].season)}</span></div>
    </div>
  );
}

/** 구단 역대 기록 (이 게임에서 쌓인 출전 · 득점, 리그 + 컵) */
function ClubRecords({ w, club }: { w: World; club: string }) {
  const rows = useMemo(() => {
    const out: { id: string; apps: number; goals: number }[] = [];
    for (const p of Object.values(w.players)) {
      let apps = 0, goals = 0;
      for (const c of p.career) if (c.club === club) { apps += c.apps + (c.cupApps ?? 0); goals += c.goals + (c.cupGoals ?? 0); }
      if (p.clubId === club && !p.retired) { apps += p.stats.apps + p.stats.subApps + (p.cupStats?.apps ?? 0); goals += p.stats.goals + (p.cupStats?.goals ?? 0); }
      if (apps > 0) out.push({ id: p.id, apps, goals });
    }
    return out;
  }, [w, club]);
  const top = (k: 'apps' | 'goals') => [...rows].filter((r) => r[k] > 0).sort((a, b) => b[k] - a[k]).slice(0, 5);
  const name = (id: string) => playerKo(id, w.players[id]?.name ?? id);
  const List = ({ k, unit }: { k: 'apps' | 'goals'; unit: string }) => (
    <div>
      <div className="mb-1.5 text-[12px] text-lo">{k === 'apps' ? '최다 출전' : '최다 득점'}</div>
      {top(k).map((r, i) => (
        <div key={r.id} className="flex items-center gap-2 py-0.5 text-[13px]">
          <span className="tnum w-4 text-lo">{i + 1}</span>
          <span className={`min-w-0 flex-1 truncate ${w.players[r.id]?.clubId === club && !w.players[r.id]?.retired ? 'text-hi' : 'text-mid'}`}>{name(r.id)}</span>
          <span className="tnum font-semibold">{r[k]}<span className="text-[11px] font-normal text-lo">{unit}</span></span>
        </div>
      ))}
      {top(k).length === 0 && <div className="text-[12px] text-lo">기록 없음</div>}
    </div>
  );
  return (
    <Card title="구단 역대 기록" action={<span className="text-[11px] text-lo">게임 속 · 리그 + 컵</span>}>
      <div className="grid grid-cols-2 gap-5 px-5 py-4"><List k="apps" unit="경기" /><List k="goals" unit="골" /></div>
    </Card>
  );
}
