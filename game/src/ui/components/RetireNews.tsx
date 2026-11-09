// 은퇴 소식 (시즌 전환 때): 내 구단 선수 · 스타 선수. 수상 연출 다음, 시즌 결산 전에 뉴스처럼 한 명씩
import { useEffect, useState } from 'react';
import { useGame } from '../../store/game';
import { useHistory, useWorld } from '../hooks';
import { clubKo, playerKo } from '../../data/db';
import { POS_KO } from '../../data/rating';
import { ageOn } from '../../engine/condition';
import { AWARD_KO } from '../../engine/awards';
import { TRAIT } from '../../engine/traits';
import { careerSpells } from '../views/PlayerPanel';
import { Crest } from './Crest';
import { josa } from '../format';

export function RetireNews() {
  const list = useGame((s) => s.news);
  const awardsOpen = useGame((s) => !!s.awards);
  const close = useGame((s) => s.closeNews);
  const w = useWorld();
  const hist = useHistory();
  const [i, setI] = useState(0);
  const open = !!list?.length && !awardsOpen;
  const next = () => (list && i < list.length - 1 ? setI(i + 1) : (setI(0), close()));
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); next(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  if (!open) return null;
  const n = list![Math.min(i, list!.length - 1)];
  const p = w.players[n.player];
  const name = playerKo(p.id, p.name);
  const spells = careerSpells(w, p, hist);
  const apps = spells.reduce((s, x) => s + x.apps, 0), goals = spells.reduce((s, x) => s + x.goals, 0);
  const seasons = new Set<string>();
  for (const sp of spells) { let y = +sp.from.slice(0, 4); while (y <= +sp.to.slice(0, 4)) seasons.add(String(y++)); }
  const honours = p.honours ?? [];

  return (
    <div className="fixed inset-0 z-[55] grid animate-[fade_0.2s_ease-out] place-items-center bg-ink-950/85 p-6 backdrop-blur-sm" onClick={next}>
      <article key={i} className="panel w-[620px] max-w-[94vw] animate-[fade_0.3s_ease-out] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-line px-7 py-3 text-[12px]">
          <span className="flex items-center gap-2 font-semibold text-amber"><span className="h-2 w-2 rounded-full bg-amber" />은퇴 발표{n.mine && <span className="rounded bg-neon-ghost px-1.5 text-neon">우리 구단</span>}</span>
          <span className="tnum text-lo">{n.season.replace('-', '/')} 시즌 종료 · {i + 1} / {list!.length}</span>
        </header>
        <div className="px-7 pt-6 pb-5">
          <h2 className="text-[22px] leading-snug font-semibold">
            {n.season.replace('-', '/')} 시즌을 끝으로 <span className="text-neon">{name}</span>{josa(name, '은', '는')} 은퇴하기로 하였습니다
          </h2>
          <div className="mt-3 flex items-center gap-2 text-[13px] text-mid">
            {POS_KO[p.pos]} · {ageOn(p.birth, w.date)}세 · 마지막 소속
            {n.club ? <><Crest clubId={n.club} size={18} /><span className="text-hi">{clubKo(n.club)}</span></> : ' 없음'}
          </div>

          <div className="mt-5 grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-line bg-line text-center">
            {([['선수 생활', `${seasons.size}시즌`], ['거친 구단', `${new Set(spells.map((s) => s.club)).size}곳`], ['이 세이브 출전', `${apps}경기`], ['이 세이브 골', `${goals}골`]] as const).map(([k, v]) => (
              <div key={k} className="bg-ink-850 px-2 py-3"><div className="tnum text-[17px] font-semibold">{v}</div><div className="text-[11px] text-lo">{k}</div></div>
            ))}
          </div>

          {spells.length > 0 && (
            <div className="mt-5">
              <div className="mb-2 text-[11px] font-semibold text-lo">발자취</div>
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-[12px]">
                {spells.map((sp, k) => (
                  <span key={k} className="flex items-center gap-1.5">
                    {k > 0 && <span className="text-lo">→</span>}
                    <span className="flex items-center gap-1.5 rounded-md bg-ink-900 px-2 py-1"><Crest clubId={sp.club} size={14} />{clubKo(sp.club)}<span className="tnum text-lo">{sp.from.slice(2, 4)}{sp.from !== sp.to ? `–${sp.to.slice(5, 7)}` : ''}</span></span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {(honours.length > 0 || p.traits.length > 0) && (
            <div className="mt-5 flex flex-wrap gap-2 text-[12px]">
              {honours.map((h, k) => <span key={k} className={`rounded-md px-2 py-1 ${h.kind === 'champion' ? 'bg-[#f2c94c]/10 text-[#f2c94c]' : 'bg-ink-800 text-hi'}`}>{AWARD_KO[h.kind]} {h.season.slice(2, 4)}/{h.season.slice(5, 7)}</span>)}
              {p.traits.map((t) => <span key={t} className="rounded-md bg-ink-800 px-2 py-1 text-mid">「{TRAIT.get(t)?.ko ?? t}」</span>)}
            </div>
          )}
        </div>
        <footer className="flex items-center justify-between border-t border-line px-7 py-4">
          <span className="text-[12px] text-lo">게임 속 소식이며 실제 선수의 은퇴와 무관합니다</span>
          <button onClick={next} className="h-10 rounded-lg bg-neon px-6 text-[14px] font-semibold text-ink-950 transition-colors hover:bg-[#5bff3d]">{i < list!.length - 1 ? '다음 소식' : '시즌 결산 보기'}</button>
        </footer>
      </article>
    </div>
  );
}
