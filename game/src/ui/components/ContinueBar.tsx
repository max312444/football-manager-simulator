// 하단 진행 바: 다음 일정 정보 + "계속" 버튼 (스페이스 키로도 진행)
import { useEffect } from 'react';
import { Icon } from './Icon';
import { Crest } from './Crest';
import { koDate, roundLabel } from '../format';
import { CompBadge } from './bits';
import { useWorld } from '../hooks';
import { useGame } from '../../store/game';
import { useApp } from '../../store/app';
import { nextUserFixture, seasonOver } from '../../engine/world';
import { clubKo } from '../../data/db';
import { sortTable } from '../../engine/standings';

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

export function ContinueBar() {
  const w = useWorld();
  const continueGame = useGame((s) => s.continueGame);
  const nextSeason = useGame((s) => s.nextSeason);
  const loading = useGame((s) => s.loading);
  const next = nextUserFixture(w);
  const over = seasonOver(w);
  const today = next?.date === w.date;
  const home = next?.home === w.userClubId;
  const opp = next ? (home ? next.away : next.home) : null;
  const dday = next ? daysBetween(w.date, next.date) : 0;
  const league = w.clubs[w.userClubId].league;
  const finalPos = over && w.competitions[league] ? sortTable(w.competitions[league].table).findIndex((r) => r.club === w.userClubId) + 1 : 0;
  const go = over ? () => { if (!loading) void nextSeason(); } : continueGame;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || useGame.getState().ceremony || useGame.getState().seasonReport || useGame.getState().awards || useGame.getState().news || useApp.getState().profile || useApp.getState().clubView || useGame.getState().world?.pendingRenewals?.length) return;   // 연출 · 결산 창이 떠 있으면 무시
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
      e.preventDefault();
      go();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  return (
    <footer className="flex h-[72px] shrink-0 items-center gap-6 border-t border-line bg-ink-900/90 px-6 backdrop-blur">
      {over ? (
        <div>
          <div className="text-[14px] font-semibold">{w.season.replace('-', '/')} 시즌 종료 · 최종 {finalPos}위</div>
          <div className="text-[12px] text-lo">다음 시즌으로 넘어가면 실제 능력치 갱신 · 승격팀 합류 · 새 선수 등장이 진행됩니다</div>
        </div>
      ) : next && opp ? (
        <div className="flex min-w-0 items-center gap-4">
          <div className={`grid h-11 w-14 shrink-0 place-items-center rounded-lg ${today ? 'bg-neon/15 text-neon' : 'bg-ink-800 text-mid'}`}>
            <div className="text-center leading-tight">
              <div className="text-[11px]">{today ? '오늘' : '남은 날'}</div>
              <div className="led text-[15px] font-semibold">{today ? '경기' : `D-${dday}`}</div>
            </div>
          </div>
          <Crest clubId={opp} size={28} />
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold">
              {clubKo(opp)} <span className="font-medium text-lo">{home ? '(홈)' : '(원정)'}</span>
            </div>
            <div className="tnum flex items-center gap-2 text-[12px] text-lo"><CompBadge f={next} className="max-w-[140px]" />{koDate(next.date)} · {roundLabel(next)}</div>
          </div>
        </div>
      ) : <div />}

      <div className="ml-auto flex items-center gap-4">
        <span className="hidden text-[12px] text-lo lg:inline">
          <kbd className="rounded border border-line-strong px-1.5 py-0.5 text-[11px] text-mid">Space</kbd> 로도 진행
        </span>
        <button onClick={go} disabled={loading}
          className="group flex h-12 min-w-[200px] items-center justify-center gap-3 rounded-lg bg-neon px-8 text-[15px] font-semibold text-ink-950 transition-colors hover:bg-[#5bff3d] active:scale-[0.98] disabled:bg-ink-700 disabled:text-lo">
          {over ? (loading ? '준비 중…' : '다음 시즌으로') : today ? '경기 준비' : '계속'}
          <Icon name="arrow" size={18} />
        </button>
      </div>
    </footer>
  );
}
