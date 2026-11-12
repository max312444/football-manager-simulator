// 명예의 전당: 이 PC 에서 했던 감독 커리어 순위 (점수 = 우승 · 지휘한 시즌)
import { useState } from 'react';
import { deleteCareer, listCareers, SEASON_POINTS, TITLE_KO, TITLE_POINTS, type TitleKind } from '../../store/careers';
import { Crest } from './Crest';

const KINDS: TitleKind[] = ['ucl', 'league1', 'uel', 'league2', 'cup'];

export function HallOfFame({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState(listCareers);
  return (
    <div className="fixed inset-0 z-50 grid animate-[fade_0.2s_ease-out] place-items-center bg-ink-950/85 p-2 sm:p-8 backdrop-blur-sm" onClick={onClose}>
      <div className="panel flex max-h-full w-full max-w-[860px] flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-line px-4 sm:px-7 py-4">
          <div>
            <h2 className="text-[17px] font-semibold">명예의 전당</h2>
            <div className="mt-0.5 text-[12px] text-lo">이 PC에서 지휘한 감독 커리어 순위 · 점수: {KINDS.map((k) => `${TITLE_KO[k]} ${TITLE_POINTS[k]}`).join(' · ')} · 시즌당 {SEASON_POINTS}</div>
          </div>
          <button onClick={onClose} className="text-[13px] text-lo hover:text-hi">닫기</button>
        </header>
        <div className="overflow-auto">
          {list.length === 0 && <div className="py-16 text-center text-[13px] text-lo">아직 기록이 없습니다. 새 게임을 시작해 시즌을 마치면 여기에 기록됩니다.</div>}
          {list.map((c, i) => {
            const cur = c.clubs[c.clubs.length - 1];
            return (
              <div key={c.id} className="flex items-center gap-5 px-4 sm:px-7 py-4 shadow-[inset_0_-1px_0_var(--color-line)]">
                <div className={`tnum w-8 text-center text-[22px] font-semibold ${i === 0 ? 'text-[#f2c94c]' : i < 3 ? 'text-hi' : 'text-lo'}`}>{i + 1}</div>
                {cur && <Crest clubId={cur.club} size={34} />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold">{c.clubs.map((x) => x.name).join(' → ')}</div>
                  <div className="mt-0.5 text-[12px] text-lo">{c.started.replace('-', '/')} 시작 · {c.seasons}시즌 · 감독 명성 {c.reputation} · {c.dataset === 'real' ? '실명 데이터' : '패러디 이름'} · 마지막 {c.date.replace(/-/g, '.')}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {KINDS.filter((k) => c.titles[k]).map((k) => <span key={k} className="rounded bg-[#f2c94c]/10 px-2 py-0.5 text-[11px] font-semibold text-[#f2c94c]">{TITLE_KO[k]} {c.titles[k]}회</span>)}
                    {!KINDS.some((k) => c.titles[k]) && <span className="text-[11px] text-lo">우승 없음</span>}
                  </div>
                </div>
                <div className="text-right"><div className="tnum text-[24px] font-semibold text-neon">{c.points}</div><div className="text-[11px] text-lo">점</div></div>
                <button onClick={() => { if (confirm('이 기록을 지울까요? (세이브는 지워지지 않습니다)')) { deleteCareer(c.id); setList(listCareers()); } }} className="text-[11px] text-lo hover:text-red">지우기</button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
