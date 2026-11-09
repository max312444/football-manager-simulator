// 게임 진행 상태: 월드(엔진 상태) + 진행 중인 사용자 경기.
// 엔진은 월드를 직접 수정하므로, 화면 갱신은 rev 숫자를 올려서 알린다.
import { create } from 'zustand';
import type { Fixture, GameEvent, Side, Tactics, World } from '../engine/types';
import { advanceDay, advanceToUserMatch, applyMatch, createWorld, prepareMatch, type SeasonInput } from '../engine/world';
import { playToEnd, setTactics, step, substitute, type MatchState } from '../engine/match';
import { createRng, type Rng } from '../engine/rng';
import { availableSeasons, dataset, leagues, loadLeagueSeason, realAvailable, setDataset } from '../data/db';
import { closeSeason, nextSeasonOf, startNextSeason, type SeasonReport } from '../engine/season';
import { seasonOver } from '../engine/world';
import { recommend, type Recommendation } from '../engine/ai';
import { matchRules, pickLineup } from '../engine/squad';
import type { Mentality, Pressing } from '../engine/types';
import { readSave, writeSave } from './save';

/** 시즌 데이터 불러오기: 그 시즌 데이터가 있는 1부 리그 전부 */
async function loadSeasonInput(season: string, mustInclude?: string): Promise<SeasonInput> {
  const ids = leagues.filter((l) => l.level === 1 && availableSeasons(l.id).includes(season)).map((l) => l.id);
  if (mustInclude && !ids.includes(mustInclude) && availableSeasons(mustInclude).includes(season)) ids.unshift(mustInclude);
  const loaded = await Promise.all(ids.map(async (id) => ({ id, clubs: (await loadLeagueSeason(season, id)).clubs })));
  return { season, leagues: loaded };
}

// 자동 저장: 진행 중 연속 호출을 묶어서 한 번만
let autoTimer: ReturnType<typeof setTimeout> | null = null;
function autosave(w: World) {
  if (autoTimer) clearTimeout(autoTimer);
  autoTimer = setTimeout(() => { writeSave('auto', w).catch((e) => console.error('자동 저장 실패', e)); }, 800);
}

/** 경기 전 스쿼드 설정 (AI 추천으로 시작, 사용자가 수정) */
export interface MatchDraft {
  formation: string;
  mentality: Mentality;
  pressing: Pressing;
  /** 포메이션 자리 순서대로 선발 */
  starters: (string | null)[];
  bench: string[];
}

export interface LiveMatch {
  fixture: Fixture;
  side: Side;
  rng: Rng;
  /** squad: 경기 전 스쿼드 설정 · live: 진행 중 · full: 종료 */
  phase: 'squad' | 'live' | 'full';
  rec: Recommendation;
  draft: MatchDraft;
  /** 선발 확정 뒤 생성 */
  state: MatchState | null;
}

const draftFrom = (r: Recommendation): MatchDraft => ({
  formation: r.lineup.formation, mentality: r.tactics.mentality, pressing: r.tactics.pressing,
  starters: r.lineup.starters.map((x) => x.id), bench: [...r.lineup.bench],
});

interface GameStore {
  world: World | null;
  rev: number;
  loading: boolean;
  match: LiveMatch | null;
  lastEvents: GameEvent[];
  seasonReport: SeasonReport | null;
  savedAt: string | null;
  nextSeason(): Promise<void>;
  dismissReport(): void;
  save(slot: string): Promise<void>;
  load(slot: string): Promise<boolean>;
  setLineup(starters: (string | null)[] | null, bench?: string[]): void;
  newGame(season: string, league: string, clubId: string): Promise<void>;
  continueGame(): void;
  updateDraft(change: Partial<MatchDraft>): void;
  resetDraft(): void;
  confirmLineup(): void;
  stepMatch(n?: number): void;
  changeTactics(t: Partial<Tactics>): void;
  sub(outId: string, inId: string): boolean;
  setClubTactics(t: Partial<Tactics>): void;
  closeMatch(): void;
  quit(): void;
}

export const useGame = create<GameStore>((set, get) => {
  const bump = () => set((s) => ({ rev: s.rev + 1 }));
  return {
    world: null, rev: 0, loading: false, match: null, lastEvents: [], seasonReport: null, savedAt: null,

    async newGame(season, league, clubId) {
      set({ loading: true });
      // 그 시즌 데이터가 있는 1부 리그를 모두 불러와 함께 진행한다
      const input = await loadSeasonInput(season, league);
      const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
      const world = createWorld(input, clubId, seed);
      world.dataset = dataset;
      set({ world, loading: false, match: null, lastEvents: [], seasonReport: null });
      autosave(world);
      bump();
    },

    continueGame() {
      const w = get().world;
      if (!w || get().match) return;
      const { events, matchToday } = advanceToUserMatch(w);
      set({ lastEvents: events });
      if (matchToday) {
        const side: Side = matchToday.home === w.userClubId ? 'home' : 'away';
        const rng = createRng(w.rng);
        // 바로 경기하지 않고 경기 전 스쿼드 설정으로: 상대에 맞춘 AI 추천을 먼저 채워 둔다
        const opp = side === 'home' ? matchToday.away : matchToday.home;
        const rec = recommend(w, w.userClubId, opp, side === 'home');
        set({ match: { fixture: matchToday, side, rng, phase: 'squad', rec, draft: draftFrom(rec), state: null } });
      }
      autosave(w);
      bump();
    },

    updateDraft(change) {
      const m = get().match;
      if (!m || m.phase !== 'squad') return;
      // 포메이션이 바뀌면 자리 구성이 달라지므로 그 포메이션 기준 AI 선발로 다시 채운다
      if (change.formation && change.formation !== m.draft.formation) {
        const w = get().world!;
        const l = pickLineup(w.clubs[w.userClubId].squad.map((id) => w.players[id]), change.formation, matchRules(w.season).benchSize);
        m.draft = { ...m.draft, ...change, starters: l.starters.map((x) => x.id), bench: l.bench };
      } else m.draft = { ...m.draft, ...change };
      bump();
    },

    resetDraft() {
      const m = get().match;
      if (!m || m.phase !== 'squad') return;
      m.draft = draftFrom(m.rec);
      bump();
    },

    /** 선발 확정 → 바로 킥오프 */
    confirmLineup() {
      const { match: m, world: w } = get();
      if (!m || !w || m.phase !== 'squad') return;
      const d = m.draft;
      const players = w.clubs[w.userClubId].squad.map((id) => w.players[id]);
      const lineup = pickLineup(players, d.formation, matchRules(w.season).benchSize, d.starters, d.bench);
      m.state = prepareMatch(w, m.fixture, m.rng, {
        manualSide: m.side,
        lineups: { [m.side]: lineup },
        tactics: { [m.side]: { formation: lineup.formation, mentality: d.mentality, pressing: d.pressing } },
      });
      m.phase = 'live';
      bump();
    },

    stepMatch(n = 1) {
      const { match: m, world: w } = get();
      if (!m || !w || m.phase !== 'live' || !m.state) return;
      const st = m.state;
      const ctx = { players: w.players, rng: m.rng };
      for (let i = 0; i < n && !st.done; i++) step(st, ctx);
      if (st.done) {
        m.phase = 'full';
        applyMatch(w, m.fixture, st);
        w.rng = m.rng.state();
        w.inbox.push({ type: 'match', date: w.date, fixtureId: m.fixture.id, league: m.fixture.league, home: m.fixture.home, away: m.fixture.away, score: [st.summary.homeGoals, st.summary.awayGoals], user: true });
      }
      bump();
    },

    changeTactics(t) {
      const m = get().match;
      if (!m?.state) return;
      setTactics(m.state, m.side, t);
      bump();
    },

    sub(outId, inId) {
      const { match: m, world: w } = get();
      if (!m?.state || !w) return false;
      const ok = substitute(m.state, m.side, outId, inId, { players: w.players, rng: m.rng });
      bump();
      return ok;
    },

    setClubTactics(t) {
      const w = get().world;
      if (!w) return;
      const c = w.clubs[w.userClubId];
      c.tactics = { ...c.tactics, ...t };
      bump();
    },

    closeMatch() {
      const { match: m, world: w } = get();
      if (!m || !w) return;
      if (m.phase !== 'full') {
        // 결과만 보기: (스쿼드 설정 중이면 지금 선발로 확정하고) 남은 시간을 한 번에 진행
        if (m.phase === 'squad') get().confirmLineup();
        const st = m.state!;
        st[m.side].manual = false;   // 남은 시간은 AI가 교체까지 맡음
        playToEnd(st, { players: w.players, rng: m.rng });
        get().stepMatch(0);
      }
      // 오늘 남은 다른 경기를 치르고 하루 넘김
      const events = advanceDay(w);
      set({ match: null, lastEvents: events });
      autosave(w);
      bump();
    },

    async nextSeason() {
      const w = get().world;
      if (!w || !seasonOver(w)) return;
      set({ loading: true });
      closeSeason(w);
      const input = await loadSeasonInput(nextSeasonOf(w.season));
      const report = startNextSeason(w, input);
      set({ loading: false, seasonReport: report });
      autosave(w);
      bump();
    },

    dismissReport() { set({ seasonReport: null }); },

    async save(slot) {
      const w = get().world;
      if (!w) return;
      const meta = await writeSave(slot, w);
      set({ savedAt: meta.savedAt });
    },

    async load(slot) {
      const world = await readSave(slot);
      if (!world) return false;
      // 다른 데이터로 만든 세이브면 그 데이터로 바꾼 뒤 (새로 고침) 자동으로 이어서 불러온다
      const need = world.dataset ?? 'real';
      if (need !== dataset) {
        if (need === 'real' && !realAvailable) return false;
        try { sessionStorage.setItem('pitchboss.resume', slot); } catch { /* 무시 */ }
        setDataset(need);
        return false;
      }
      set({ world, match: null, lastEvents: [], seasonReport: null });
      bump();
      return true;
    },

    setLineup(starters, bench = []) {
      const w = get().world;
      if (!w) return;
      w.clubs[w.userClubId].lineup = starters ? { starters, bench } : null;
      autosave(w);
      bump();
    },

    quit() { set({ world: null, match: null, lastEvents: [], seasonReport: null }); },
  };
});

// 개발 중 이 파일(게임 상태)이 바뀌면 화면 일부만 교체하지 않고 페이지 전체를 새로 고친다.
// 일부만 교체되면 화면마다 서로 다른 월드를 보게 되어 순위 등이 어긋난다. (자동 저장에서 이어하기로 복구)
if (import.meta.hot) import.meta.hot.accept(() => location.reload());
