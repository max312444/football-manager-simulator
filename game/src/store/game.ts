// 게임 진행 상태: 월드(엔진 상태) + 진행 중인 사용자 경기.
// 엔진은 월드를 직접 수정하므로, 화면 갱신은 rev 숫자를 올려서 알린다.
import { create } from 'zustand';
import type { Fixture, GameEvent, Side, Tactics, World } from '../engine/types';
import { advanceDay, advanceToUserMatch, applyMatch, createWorld, prepareMatch, type SeasonInput } from '../engine/world';
import { playToEnd, setTactics, step, substitute, type MatchState } from '../engine/match';
import { createRng, type Rng } from '../engine/rng';
import { availableSeasons, leagues, loadLeagueSeason } from '../data/db';

export interface LiveMatch {
  fixture: Fixture;
  side: Side;
  state: MatchState;
  rng: Rng;
  phase: 'pre' | 'live' | 'full';
}

interface GameStore {
  world: World | null;
  rev: number;
  loading: boolean;
  match: LiveMatch | null;
  lastEvents: GameEvent[];
  newGame(season: string, league: string, clubId: string): Promise<void>;
  continueGame(): void;
  kickOff(): void;
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
    world: null, rev: 0, loading: false, match: null, lastEvents: [],

    async newGame(season, league, clubId) {
      set({ loading: true });
      // 그 시즌 데이터가 있는 1부 리그를 모두 불러와 함께 진행한다
      const ids = leagues.filter((l) => l.level === 1 && availableSeasons(l.id).includes(season)).map((l) => l.id);
      if (!ids.includes(league)) ids.unshift(league);
      const loaded = await Promise.all(ids.map(async (id) => ({ id, clubs: (await loadLeagueSeason(season, id)).clubs })));
      const input: SeasonInput = { season, leagues: loaded };
      const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
      set({ world: createWorld(input, clubId, seed), loading: false, match: null, lastEvents: [] });
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
        const state = prepareMatch(w, matchToday, rng, { manualSide: side });
        w.rng = rng.state();
        set({ match: { fixture: matchToday, side, state, rng, phase: 'pre' } });
      }
      bump();
    },

    kickOff() {
      const m = get().match;
      if (m && m.phase === 'pre') { m.phase = 'live'; bump(); }
    },

    stepMatch(n = 1) {
      const { match: m, world: w } = get();
      if (!m || !w || m.phase !== 'live') return;
      const ctx = { players: w.players, rng: m.rng };
      for (let i = 0; i < n && !m.state.done; i++) step(m.state, ctx);
      if (m.state.done) {
        m.phase = 'full';
        applyMatch(w, m.fixture, m.state);
        w.rng = m.rng.state();
        w.inbox.push({ type: 'match', date: w.date, fixtureId: m.fixture.id, league: m.fixture.league, home: m.fixture.home, away: m.fixture.away, score: [m.state.summary.homeGoals, m.state.summary.awayGoals], user: true });
      }
      bump();
    },

    changeTactics(t) {
      const m = get().match;
      if (!m) return;
      setTactics(m.state, m.side, t);
      bump();
    },

    sub(outId, inId) {
      const { match: m, world: w } = get();
      if (!m || !w) return false;
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
        // 결과만 보기: 남은 시간을 한 번에 진행
        if (m.phase === 'pre') m.phase = 'live';
        m.state[m.side].manual = false;   // 남은 시간은 AI가 교체까지 맡음
        playToEnd(m.state, { players: w.players, rng: m.rng });
        get().stepMatch(0);
      }
      // 오늘 남은 다른 경기를 치르고 하루 넘김
      const events = advanceDay(w);
      set({ match: null, lastEvents: events });
      bump();
    },

    quit() { set({ world: null, match: null, lastEvents: [] }); },
  };
});
