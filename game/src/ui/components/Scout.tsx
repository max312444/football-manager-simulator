// 스카우트 화면 조각: 보이는 능력(범위) · 숨은 성향 · 스카우트 보내기
import type { PlayerState, World } from '../../engine/types';
import type { Hidden } from '../../engine/types';
import { fogOn, hiddenKnown, knowledge, MAX_PLAYER_JOBS, REPORT_K, scoutCost, scoutDays, seenOverall, seenRange } from '../../engine/scout';
import { compKo } from '../../data/db';
import { useGame } from '../../store/game';
import { useWorld } from '../hooks';
import { money, ratingTone } from '../format';

/** 능력: 정확하면 숫자, 모르면 '78–86' */
export function OvrText({ w, p, className = '' }: { w: World; p: PlayerState; className?: string }) {
  const [lo, hi] = seenOverall(w, p);
  if (lo === hi) return <span className={`tnum font-semibold ${ratingTone(lo)} ${className}`}>{lo}</span>;
  return <span className={`tnum font-semibold whitespace-nowrap text-mid ${className}`} title="스카우트하면 정확히 알 수 있습니다">{lo}<span className="text-lo">–</span>{hi}</span>;
}
export { seenRange };

const HIDDEN_KO: [keyof Hidden, string, boolean][] = [
  ['professionalism', '프로의식', false], ['ambition', '야망', false], ['loyalty', '충성 성향', false], ['consistency', '꾸준함', false],
  ['bigMatch', '큰 경기', false], ['temperament', '침착함', false], ['adaptability', '적응력', false], ['injuryProne', '부상 경향', true],
];
const level = (v: number) => (v <= 5 ? '매우 낮음' : v <= 8 ? '낮음' : v <= 12 ? '보통' : v <= 15 ? '높음' : '매우 높음');

/** 숨은 성향 (앎 70 이상 · 내 선수) */
export function HiddenTraits({ p }: { p: PlayerState }) {
  const w = useWorld();
  if (!hiddenKnown(w, p)) return null;
  return (
    <div className="mb-5">
      <div className="mb-2 text-[11px] font-semibold text-lo">성향 {p.clubId !== w.userClubId && <span className="font-normal text-sky">· 스카우트 보고서</span>}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
        {HIDDEN_KO.map(([k, label, bad]) => {
          const v = p.hidden[k];
          const good = bad ? v <= 8 : v >= 13, poor = bad ? v >= 13 : v <= 8;
          return <div key={k} className="flex justify-between"><span className="text-mid">{label}</span><span className={good ? 'text-neon' : poor ? 'text-amber' : 'text-hi'}>{level(v)}</span></div>;
        })}
      </div>
    </div>
  );
}

/** 다른 구단 선수: 얼마나 아는지 · 스카우트 보내기 */
export function ScoutBox({ p }: { p: PlayerState }) {
  const w = useWorld();
  const scout = useGame((s) => s.scout);
  if (!fogOn(w) || p.clubId === w.userClubId || p.retired) return null;
  const k = knowledge(w, p);
  const job = w.scout?.jobs.find((j) => j.kind === 'player' && j.target === p.id);
  const league = p.clubId ? w.clubs[p.clubId].league : null;
  const ljob = league ? w.scout?.jobs.find((j) => j.kind === 'league' && j.target === league) : null;
  const left = (d: string) => Math.max(0, Math.round((Date.parse(d) - Date.parse(w.date)) / 864e5));
  const busy = (w.scout?.jobs.filter((j) => j.kind === 'player').length ?? 0) >= MAX_PLAYER_JOBS;
  return (
    <div className="mb-4 rounded-lg bg-ink-900 px-3 py-3 text-[12px]">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-mid">스카우트 정보 <span className="font-semibold text-hi">{k >= REPORT_K ? '정확' : `${k}%`}</span></span>
        <span className="text-lo">{k >= REPORT_K ? '보고서 있음' : k >= 70 ? '성향까지 파악' : '능력치는 범위로만'}</span>
      </div>
      <div className="mb-2.5 h-1 overflow-hidden rounded-full bg-ink-700"><div className="h-full rounded-full bg-sky" style={{ width: `${k}%` }} /></div>
      {k < REPORT_K && (job
        ? <div className="text-sky">스카우트가 관찰 중 · {left(job.done)}일 뒤 보고서</div>
        : <button disabled={busy} onClick={() => { const r = scout('player', p.id); if (!r.ok) alert(r.reason); }}
            className="w-full rounded-md bg-sky/15 py-1.5 font-semibold text-sky ring-1 ring-sky/40 hover:bg-sky/25 disabled:opacity-40">
            {busy ? `스카우트 모두 출장 중 (${MAX_PLAYER_JOBS}명)` : `스카우트 보내기 · ${money(scoutCost(w, 'player', p.id))} · ${scoutDays(w, 'player', p.id)}일`}
          </button>)}
      {league && k < 65 && (ljob
        ? <div className="mt-1.5 text-lo">{compKo(league)} 전체 관찰 중 · {left(ljob.done)}일 뒤</div>
        : !w.scout?.jobs.some((j) => j.kind === 'league') && (
          <button onClick={() => { const r = scout('league', league); if (!r.ok) alert(r.reason); }} className="mt-1.5 w-full text-left text-lo hover:text-hi">
            또는 {compKo(league)} 전체 관찰 · {money(scoutCost(w, 'league'))} · 28일 →
          </button>))}
    </div>
  );
}
