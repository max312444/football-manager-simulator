// 게임 진행 상태: 월드(엔진 상태) + 진행 중인 사용자 경기.
// 엔진은 월드를 직접 수정하므로, 화면 갱신은 rev 숫자를 올려서 알린다.
import { newCareerId, recordCareer } from './careers';
import { changeRole, type Role } from '../engine/roles';
import { create } from 'zustand';
import type { Fixture, GameEvent, Side, Tactics, World } from '../engine/types';
import { advanceDay, advanceToUserMatch, applyMatch, createWorld, prepareMatch, type SeasonInput } from '../engine/world';
import { playToEnd, setFormation, setTactics, step, substitute, type MatchState } from '../engine/match';
import { createRng, type Rng } from '../engine/rng';
import { seedTraits } from '../engine/traits';
import { availableSeasons, clubKo, clubs as clubMasters, dataset, leagues, loadHistory, loadLeagueSeason, loadStandings, playerKo, realAvailable, registerGeneratedNames, setDataset, worldCupsMeta } from '../data/db';
import { closeSeason, nextSeasonOf, startNextSeason, type SeasonReport } from '../engine/season';
import { fillContracts, seasonOver } from '../engine/world';
import { recommend, type Recommendation } from '../engine/ai';
import { withinRules } from '../engine/rules';
import { trainingOf, type Training } from '../engine/training';
import { syncWorld, useSettings } from './settings';
import { useApp } from './app';
import { acceptOffer, chooseJob, declineOffer, ensureManager } from '../engine/manager';
import { askBoard, type BoardAsk } from '../engine/board';
import { resolveBoardEvent } from '../engine/boardEvents';
import { answerPress, pressReaction } from '../engine/press';
import { sagaRespond, type SagaAction } from '../engine/saga';
import { scandalRespond, type ScandalAction } from '../engine/scandal';
import { evaluateLoan, exerciseBuy, loanMove, loanReturn, playerWillLoan, type LoanTerms } from '../engine/loan';
import { breakTalks, cleanOffers, completeTransfer, counterOffer, offerValid, evaluateBid, MAX_TRIES, playerWillJoin, releasePlayer, talkBanned, talkOf, wageDemand, wageRoom, windowOpen, type BidResult } from '../engine/transfer';
import type { RetireNews, TransferOffer } from '../engine/types';
import { applyRenewal, evaluateRenewal } from '../engine/contract';
import { buyoutMandatory, setBuyout } from '../engine/clauses';
import { bosmanEligible, signPrecontract } from '../engine/bosman';
import { meetingReady, teamMeeting } from '../engine/chemistry';
const addDaysIso = (iso: string, n: number) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
import { CUSTOM_MARK, formationShape, guessFormation, matchRules, MAX_CUSTOM, pickLineup, registerFormations, validateFormation } from '../engine/squad';
import type { Position } from '../data/types';
import { startScout } from '../engine/scout';
import type { Mentality, Pressing } from '../engine/types';
import { exportSaveFile, readSave, readSaveFile, writeSave } from './save';
import type { Ceremony } from '../ui/components/TransferCeremony';
import type { Award } from '../engine/awards';

/** 시즌 데이터 불러오기: 그 시즌 데이터가 있는 1부 · 2부 리그 전부 */
async function loadSeasonInput(season: string, mustInclude?: string): Promise<SeasonInput> {
  const ids = leagues.filter((l) => l.level <= 2 && availableSeasons(l.id).includes(season)).map((l) => l.id);
  if (mustInclude && !ids.includes(mustInclude) && availableSeasons(mustInclude).includes(season)) ids.unshift(mustInclude);
  const loaded = await Promise.all(ids.map(async (id) => ({ id, clubs: (await loadLeagueSeason(season, id)).clubs })));
  // 첫 시즌 유럽 대회 출전권: 실제 지난 시즌 순위 (있는 리그만)
  const y = +season.slice(0, 4) - 1;
  const prev = `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
  const prevStandings: Record<string, string[]> = {};
  for (const id of ids) { const st = await loadStandings(prev, id); if (st) prevStandings[id] = st; }
  return { season, leagues: loaded, prevStandings, worldCups: worldCupsMeta };
}

// 자동 저장: 진행 중 연속 호출을 묶어서 한 번만
let autoTimer: ReturnType<typeof setTimeout> | null = null;
/** 자동 저장 (설정: 진행할 때마다 · 1주 · 1달 · 안 함) */
let lastAutoDate = '';
/** 큰 경기: 유럽 대회 · 컵 결승 · 플레이오프 · 비슷하거나 강한 상대 (설정 '중요한 일만' 에서 직접 지휘) */
function bigMatch(w: World, f: Fixture): boolean {
  if (f.stage && f.stage !== 'cup') return true;
  if (f.stage === 'cup' && /결승|준결승/.test(f.name ?? '')) return true;
  const opp = f.home === w.userClubId ? f.away : f.home;
  return (w.clubs[opp]?.reputation ?? 0) >= w.clubs[w.userClubId].reputation - 3;
}

function autosave(w: World, force = false) {
  recordCareer(w);   // 명예의 전당 기록 (저장 간격과 상관없이)
  const every = useSettings.getState().s.autosave;
  if (!force) {
    if (every === 'off') return;
    const gap = every === 'week' ? 7 : every === 'month' ? 30 : 0;
    if (gap && lastAutoDate && Math.abs(Date.parse(w.date) - Date.parse(lastAutoDate)) < gap * 864e5) return;
  }
  lastAutoDate = w.date;
  if (autoTimer) clearTimeout(autoTimer);
  autoTimer = setTimeout(() => { writeSave('auto', w).catch((e) => console.error('자동 저장 실패', e)); }, 800);
}

/** 경기 전 스쿼드 설정 (AI 추천으로 시작, 사용자가 수정) */
/** 이벤트 선택 결과 (팝업 자리에 이어서 보여 줌) */
export interface EventResult { tag: string; tone: string; choice?: string; lines: string[]; next?: string }

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
  /** 이벤트 팝업에서 고른 뒤 보여 줄 결과 (같은 자리에 이어서) */
  eventResult: EventResult | null;
  closeEventResult(): void;
  savedAt: string | null;
  /** 불러오기 실패 이유 (화면 안내용) */
  loadError: string | null;
  /** 이적 확정 연출 */
  ceremony: Ceremony | null;
  closeCeremony(): void;
  nextSeason(): Promise<void>;
  dismissReport(): void;
  save(slot: string): Promise<void>;
  load(slot: string): Promise<boolean>;
  /** 파일로 내보내기 · 파일에서 불러오기 (.pitchboss) */
  exportFile(): Promise<void>;
  importFile(file: File): Promise<boolean>;
  setLineup(starters: (string | null)[] | null, bench?: string[]): void;
  /** random: 완전 랜덤으로 고른 구단 → 첫 시즌만 예산 · 재정 규정 한도 보정 */
  newGame(season: string, league: string, clubId: string, opts?: { random?: boolean }): Promise<void>;
  continueGame(): void;
  updateDraft(change: Partial<MatchDraft>): void;
  resetDraft(): void;
  confirmLineup(): void;
  /** 이적: 구단에 이적료 제안 (수락되면 계약 협상 단계로) */
  /** 이적료 제안. left = 남은 기회, broken = 협상 결렬 (이번 이적시장 동안 다시 협상 불가) */
  bid(playerId: string, fee: number): BidResult & { blocked?: string; left?: number; broken?: boolean };
  /** 이적: 선수에게 계약 제안 (fee는 합의된 이적료, 자유계약이면 0) */
  /** 재계약 요청 팝업 닫기 */
  clearRenewals(): void;
  /** 내 선수 재계약 제안 */
  precontract(playerId: string, wage: number, years: number, role?: Role, clause?: number): { ok: boolean; reason: string; left?: number; broken?: boolean };
  clearDeadline(): void;
  setCaptain(playerId: string | null): void;
  holdMeeting(): { ok: boolean; text: string };
  renew(playerId: string, wage: number, years: number, clause?: number): { ok: boolean; reason: string; left?: number; broken?: boolean };
  /** 개인 계약 제안 (이적료는 합의된 금액, 자유계약은 0) */
  sign(playerId: string, wage: number, years: number, role?: Role, clause?: number): { ok: boolean; reason: string; left?: number; broken?: boolean };
  /** 내 선수 역할 바꾸기 */
  setRole(playerId: string, role: Role): void;
  toggleShortlist(playerId: string): void;
  toggleTransferList(playerId: string): void;
  release(playerId: string): void;
  answerOffer(offerId: string, accept: boolean): string;
  /** 받은 제안에 역제안 (이적료). done = 이적 성사, gone = 제안이 사라짐 */
  counter(offerId: string, ask: number): { result: 'accept' | 'raise' | 'reject' | 'withdraw' | 'gone'; fee: number; reason: string; done?: boolean };
  stepMatch(n?: number): void;
  changeTactics(t: Partial<Tactics>): void;
  /** 경기 중 포메이션 바꾸기 */
  changeFormation(formation: string): void;
  sub(outId: string, inId: string): boolean;
  setClubTactics(t: Partial<Tactics>): void;
  /** 내 포메이션 저장 (prev: 고치는 포메이션 이름) → 오류 문구 또는 null */
  saveFormation(prev: string | null, name: string, slots: Position[]): string | null;
  deleteFormation(key: string): void;
  /** 스카우트 보내기: 선수 한 명 · 리그 전체 */
  scout(kind: 'player' | 'league', target: string): { ok: boolean; reason?: string };
  /** 훈련 초점 · 강도 */
  setTraining(t: Partial<Training>): void;
  /** 감독: 제안 수락 · 거절 · 새 구단 고르기 · 다른 구단 제안 받기 */
  managerAccept(idx: number): void;
  managerDecline(idx: number): void;
  managerChoose(club: string): void;
  managerSetOpen(open: boolean): void;
  /** 시설 투자 (구단 돈 · 공사 기간) */
  upgradeFacility(kind: 'training' | 'youth'): { ok: boolean; reason?: string };
  /** 이사회에 요청 (추가 예산 · 시설) → 확률로 찬성 · 반대 */
  boardAsk(a: BoardAsk): { ok: boolean; text: string };
  /** 이사회 이벤트 선택 */
  boardChoose(key: string): void;
  /** 기자회견 답변 (질문 하나씩, skip = 불참) */
  pressAnswer(key: string): void;
  /** 선수 언론 플레이 대응 · 창 닫기 · 창 열기 */
  sagaRespond(playerId: string, action: SagaAction, label?: string): string;
  sagaClose(): void;
  sagaOpen(playerId: string): void;
  /** 선수 논란 대응 */
  scandalRespond(action: ScandalAction, label?: string): string;
  /** 임대: 다른 구단 선수 빌려 오기 · 내 선수 보내기 · 완전 영입 옵션 행사 */
  loanIn(playerId: string, terms: LoanTerms): { ok: boolean; msg: string };
  loanOut(playerId: string, club: string, terms: LoanTerms): { ok: boolean; msg: string };
  loanBuy(playerId: string): { ok: boolean; msg: string };
  closeMatch(): void;
  /** 킥오프 전 스쿼드 설정에서 홈으로 (경기는 그대로 남고, 계속을 누르면 다시 열림) */
  leaveMatch(): void;
  /** 시즌 말 내 구단 수상 연출 */
  awards: Award[] | null;
  closeAwards(): void;
  /** 은퇴 소식 (수상 연출 다음, 시즌 결산 전) */
  news: RetireNews[] | null;
  closeNews(): void;
  quit(): void;
}

export const useGame = create<GameStore>((set, get) => {
  const bump = () => set((s) => ({ rev: s.rev + 1 }));
  /** 내 선수를 제안한 구단으로 보낸다 (사는 구단은 선수가 원하는 주급을 맞춰 준다) */
  const sellTo = (o: TransferOffer): { ok: boolean; msg: string } => {
    const w = get().world!;
    const p = w.players[o.player];
    const wage = wageDemand(w, p);
    const r = playerWillJoin(w, p, o.from, wage);
    if (!r.ok) return { ok: false, msg: `선수가 이적을 원하지 않아 무산됐습니다 (${r.reason})` };
    w.inbox.push(completeTransfer(w, p, o.from, o.fee, wage, 3));
    set({ ceremony: { player: p.id, playerName: p.name, from: w.userClubId, to: o.from, fee: o.fee, wage, years: 3, kind: 'out' } });
    return { ok: true, msg: `이적이 성사됐습니다 · 이적료 ${Math.round(o.fee / 1e5) / 10}M 유로` };
  };
  return {
    world: null, rev: 0, loading: false, match: null, lastEvents: [], seasonReport: null, eventResult: null, savedAt: null, loadError: null, ceremony: null, awards: null, news: null,

    closeCeremony() { set({ ceremony: null }); },
    closeAwards() { set({ awards: null }); },
    closeNews() { set({ news: null }); },

    async newGame(season, league, clubId, opts = {}) {
      set({ loading: true });
      // 그 시즌 데이터가 있는 1부 리그를 모두 불러와 함께 진행한다
      const input = await loadSeasonInput(season, league);
      const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
      const world = createWorld(input, clubId, seed);
      world.dataset = dataset;
      world.careerId = newCareerId();
      // 베테랑 · 스타 선수 시작 호칭 (실제 시즌 기록 기준)
      const hist = await loadHistory();
      if (hist) seedTraits(world, hist, createRng((seed ^ 0x7a17) >>> 0));
      if (opts.random) {
        const f = world.clubs[clubId].finance;
        f.transferBudget = Math.round(f.transferBudget * 1.1);
        f.wageBudget = Math.round(f.wageBudget * 1.05);
        world.randomBonus = { season };
        world.inbox.push({ type: 'info', date: world.date, text: '완전 랜덤으로 맡은 구단 · 이번 시즌만 이적 예산 +10% · 주급 예산 +5% · 재정 규정 한도 +5%' });
      }
      syncWorld(world);
      set({ world, loading: false, match: null, lastEvents: [], seasonReport: null });
      autosave(world);
      bump();
    },

    continueGame() {
      const w = get().world;
      if (!w || get().match || w.manager?.pendingJob) return;   // 감독: 새 구단을 골라야 하면 진행 멈춤
      syncWorld(w);   // 설정 (팝업 · 난이도) 을 이 게임에 반영
      const st = useSettings.getState().s;
      const startWindow = windowOpen(w.season, w.date);
      const all: GameEvent[] = [];
      // 설정 '계속이 멈추는 곳': 내 경기마다 (기본) · 중요한 일만 · 이적시장 · 시즌 끝까지
      for (let guard = 0; guard < 400; guard++) {
        const { events, matchToday } = advanceToUserMatch(w);
        registerGeneratedNames(w.players);   // 월드컵 국내파 가상 선수 한국어 이름
        all.push(...events);
        const m = w.manager;
        const halt = !!(m?.pendingJob || m?.boardEvent || m?.press || w.sagaPrompt || w.scandalPrompt || w.pendingRenewals?.length || seasonOver(w)
          || events.some((e) => e.type === 'seasonEnd' || (e.type === 'injury' && e.club === w.userClubId && (st.stopAt === 'match' || e.days >= 28))));   // 내 경기마다가 아니면 4주 이상 큰 부상만
        if (!matchToday) { if (halt || st.stopAt === 'match') break; continue; }   // 경기 말고 다른 일로 멈춤 (부상 · 재계약 요청 · 시즌 끝 등)
        const side: Side = matchToday.home === w.userClubId ? 'home' : 'away';
        const rng = createRng(w.rng);
        // 경기 전 스쿼드 설정: 상대에 맞춘 AI 추천을 먼저 채워 둔다
        const opp = side === 'home' ? matchToday.away : matchToday.home;
        const rec = recommend(w, w.userClubId, opp, side === 'home');
        set({ match: { fixture: matchToday, side, rng, phase: 'squad', rec, draft: draftFrom(rec), state: null } });
        const big = bigMatch(w, matchToday);
        const auto = st.matchMode === 'result' || (st.stopAt === 'important' && !big) || st.stopAt === 'window';
        if (!auto || halt) break;                 // 직접 지휘 (스쿼드 설정 화면)
        get().closeMatch();                       // 결과만: 지금 선발로 바로 경기
        all.push(...get().lastEvents);
        const after = w.manager;
        if (get().ceremony || after?.pendingJob || after?.boardEvent || after?.press || w.sagaPrompt || w.scandalPrompt || w.pendingRenewals?.length || seasonOver(w)) break;
        if (st.stopAt === 'match') break;         // 내 경기마다: 결과를 보고 멈춤
        if (st.stopAt === 'window' && windowOpen(w.season, w.date) !== startWindow) break;   // 이적시장이 열리거나 닫히면
      }
      set({ lastEvents: all });
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

    changeFormation(formation) {
      const { match: m, world: w } = get();
      if (!m?.state || !w) return;
      setFormation(m.state, m.side, formation, { players: w.players, rng: m.rng });
      bump();
    },

    sub(outId, inId) {
      const { match: m, world: w } = get();
      if (!m?.state || !w) return false;
      const ok = substitute(m.state, m.side, outId, inId, { players: w.players, rng: m.rng });
      bump();
      return ok;
    },

    saveFormation(prev, name, slots) {
      const w = get().world;
      if (!w) return '게임이 없습니다';
      const errs = validateFormation(slots);
      if (errs.length) return errs[0];
      const key = `${CUSTOM_MARK} ${name.trim() || formationShape(slots)}`.slice(0, 24);
      const all = (w.customFormations ??= {});
      if (key !== prev && all[key]) return '같은 이름의 포메이션이 있습니다';
      if (!prev && Object.keys(all).length >= MAX_CUSTOM) return `내 포메이션은 ${MAX_CUSTOM}개까지`;
      const c = w.clubs[w.userClubId];
      const using = prev && c.tactics.formation === prev;
      const same = prev && JSON.stringify(all[prev]) === JSON.stringify(slots);
      if (prev && prev !== key) delete all[prev];
      all[key] = [...slots];
      registerFormations(all);
      if (using) { c.tactics = { ...c.tactics, formation: key }; if (!same) c.lineup = null; }
      autosave(w);
      bump();
      return null;
    },

    scout(kind, target) {
      const w = get().world;
      if (!w) return { ok: false, reason: '게임이 없습니다' };
      const r = startScout(w, kind, target);
      if (r.ok) { autosave(w); bump(); }
      return r;
    },

    deleteFormation(key) {
      const w = get().world;
      if (!w?.customFormations?.[key]) return;
      delete w.customFormations[key];
      registerFormations(w.customFormations);
      const c = w.clubs[w.userClubId];
      if (c.tactics.formation === key) { c.tactics = { ...c.tactics, formation: guessFormation(c.squad.map((id) => w.players[id])) }; c.lineup = null; }
      autosave(w);
      bump();
    },

    setClubTactics(t) {
      const w = get().world;
      if (!w) return;
      const c = w.clubs[w.userClubId];
      c.tactics = { ...c.tactics, ...t };
      bump();
    },

    managerAccept(idx) {
      const w = get().world;
      if (!w) return;
      const rng = createRng((w.rng ^ 0x77) >>> 0);
      w.inbox.push(...acceptOffer(w, idx, rng));
      w.rng = rng.state();
      registerGeneratedNames(w.players);
      autosave(w);
      bump();
    },
    managerDecline(idx) {
      const w = get().world;
      if (!w) return;
      declineOffer(w, idx);
      autosave(w);
      bump();
    },
    managerChoose(club) {
      const w = get().world;
      if (!w) return;
      const rng = createRng((w.rng ^ 0x78) >>> 0);
      w.inbox.push(...chooseJob(w, club, rng));
      w.rng = rng.state();
      autosave(w);
      bump();
    },
    upgradeFacility(kind) {
      const r = get().boardAsk({ kind: 'facility', facility: kind });
      return { ok: r.ok, reason: r.text };
    },
    closeEventResult() { set({ eventResult: null }); },

    sagaRespond(playerId, action, label) {
      const w = get().world;
      if (!w) return '';
      const rng = createRng((w.rng ^ 0x5a6a) >>> 0);
      const r = sagaRespond(w, playerId, action, rng);
      w.rng = (w.rng + 7) >>> 0;
      w.inbox.push(...r.events);
      w.sagaPrompt = undefined;
      set({ eventResult: { tag: '선수 · 대응 결과', tone: 'text-amber', choice: label, lines: [r.text || '아직 별다른 반응은 없습니다'] } });
      autosave(w);
      bump();
      return r.text;
    },
    loanIn(playerId, terms) {
      const w = get().world!;
      const p = w.players[playerId];
      const c = evaluateLoan(w, p, w.userClubId, terms);
      if (!c.ok) return { ok: false, msg: c.reason };
      const pw = playerWillLoan(w, p, w.userClubId);
      if (!pw.ok) return { ok: false, msg: pw.reason };
      if (terms.fee > w.clubs[w.userClubId].finance.transferBudget) return { ok: false, msg: '이적 예산이 모자랍니다 (임대료)' };
      if (Math.round(p.wage * terms.share) > wageRoom(w, w.userClubId)) return { ok: false, msg: '주급 여유가 모자랍니다' };
      // 이적 조건의 영입 후 주급: 선수가 원하는 주급의 90% 이상이어야
      const want = wageDemand(w, p);
      if (terms.buy && (terms.buyWage ?? p.wage) < want * 0.9) return { ok: false, msg: `선수: 영입 후 주급으로 ${Math.round(want / 1000)}K 유로 정도를 원합니다` };
      if (terms.fee) w.clubs[w.userClubId].finance.transferBudget -= terms.fee;
      w.inbox.push(loanMove(w, p, w.userClubId, terms));
      autosave(w); bump();
      return { ok: true, msg: `${p.name} 임대 영입 · 이번 시즌 끝까지` };
    },
    loanOut(playerId, club, terms) {
      const w = get().world!;
      const p = w.players[playerId];
      if (!windowOpen(w.season, w.date)) return { ok: false, msg: '이적시장이 닫혀 있습니다' };
      if (p.loan) return { ok: false, msg: '빌려 온 선수는 다시 임대 보낼 수 없습니다' };
      const pw = playerWillLoan(w, p, club);
      if (!pw.ok) return { ok: false, msg: pw.reason };
      w.inbox.push(loanMove(w, p, club, terms));
      const c = w.clubs[w.userClubId];
      if (c.lineup) c.lineup = { starters: c.lineup.starters.map((x) => (x === playerId ? null : x)), bench: c.lineup.bench.filter((x) => x !== playerId) };
      autosave(w); bump();
      return { ok: true, msg: '임대를 보냈습니다 · 시즌이 끝나면 돌아옵니다' };
    },
    loanBuy(playerId) {
      const w = get().world!;
      const p = w.players[playerId];
      const fee = p.loan?.buy;
      if (!fee || p.clubId !== w.userClubId) return { ok: false, msg: '완전 영입 옵션이 없습니다' };
      if (fee > w.clubs[w.userClubId].finance.transferBudget) return { ok: false, msg: '이적 예산이 모자랍니다' };
      w.inbox.push(...exerciseBuy(w, p));
      autosave(w); bump();
      return { ok: true, msg: '완전 영입 옵션을 행사했습니다' };
    },
    scandalRespond(action, label) {
      const w = get().world;
      if (!w) return '';
      const rng = createRng((w.rng ^ 0x5c4d) >>> 0);
      const r = scandalRespond(w, action, rng);
      w.rng = (w.rng + 11) >>> 0;
      w.inbox.push(...r.events);
      set({ eventResult: { tag: '선수 논란 · 대응 결과', tone: 'text-red', choice: label, lines: [r.text || '조용히 지나갔습니다'] } });
      autosave(w);
      bump();
      return r.text;
    },
    sagaClose() { const w = get().world; if (!w) return; w.sagaPrompt = undefined; bump(); },
    sagaOpen(playerId) { const w = get().world; if (!w) return; w.sagaPrompt = playerId; bump(); },
    pressAnswer(key) {
      const w = get().world;
      if (!w) return;
      const q = w.manager?.press?.questions[0];
      const a = q?.answers.find((x) => x.key === key);
      const pname = q?.player && w.players[q.player] ? playerKo(q.player, w.players[q.player].name) : '선수';
      const left = (w.manager?.press?.questions.length ?? 1) - 1;
      w.inbox.push(...answerPress(w, key));
      set({ eventResult: key === 'skip'
        ? { tag: '기자회견', tone: 'text-sky', choice: '기자회견 불참', lines: ['기자들이 불만을 드러냅니다 · 내일 신문이 곱지 않을 겁니다'] }
        : { tag: '기자회견 · 반응', tone: 'text-sky', choice: a?.label, lines: a ? pressReaction(a.fx, pname) : [], next: left > 0 ? `다음 질문 (${left}개 남음)` : undefined } });
      autosave(w);
      bump();
    },
    boardChoose(key) {
      const w = get().world;
      if (!w) return;
      const opt = w.manager?.boardEvent?.options.find((o) => o.key === key);
      const evs = resolveBoardEvent(w, key);
      w.inbox.push(...evs);
      set({ eventResult: { tag: '결과', tone: 'text-amber', choice: opt?.label, lines: evs.flatMap((e) => (e.type === 'info' ? [e.text] : [])) } });
      autosave(w);
      bump();
    },
    boardAsk(a) {
      const w = get().world;
      if (!w) return { ok: false, text: '' };
      const rng = createRng((w.rng ^ 0xb0a7) >>> 0);
      const r = askBoard(w, a, rng);
      w.rng = (w.rng + 1) >>> 0;
      w.inbox.push(...r.events);
      autosave(w);
      bump();
      return r;
    },
    managerSetOpen(open) {
      const w = get().world;
      if (!w) return;
      ensureManager(w).open = open;
      autosave(w);
      bump();
    },

    setTraining(t) {
      const w = get().world;
      if (!w) return;
      const c = w.clubs[w.userClubId];
      c.training = { ...trainingOf(c), ...t };
      autosave(w);
      bump();
    },

    leaveMatch() {
      if (get().match?.phase === 'squad') set({ match: null });
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
      useApp.getState().setTab('home');   // 경기가 끝나면 어디서 시작했든 홈으로 (결과 · 순위부터 확인)
      autosave(w);
      bump();
    },

    bid(playerId, fee) {
      const w = get().world!;
      const p = w.players[playerId];
      const ban = talkBanned(w, playerId);
      if (ban) return { decision: 'reject', ask: 0, reason: '', blocked: `협상이 결렬된 선수입니다. ${ban.slice(5).replace('-', '/')}까지 다시 협상할 수 없습니다` };
      if (p.clubId && !windowOpen(w.season, w.date)) return { decision: 'reject', ask: 0, reason: '', blocked: '이적시장이 닫혀 있어 다른 구단 선수는 영입할 수 없습니다 (자유계약 선수는 가능)' };
      if (p.clubId && fee > w.clubs[w.userClubId].finance.transferBudget) return { decision: 'reject', ask: 0, reason: '', blocked: '이적 예산이 부족합니다' };
      const t = talkOf(w, playerId);
      const r = evaluateBid(w, p, w.userClubId, fee);
      if (r.decision === 'accept') { t.agreed = fee; autosave(w); bump(); return { ...r, left: MAX_TRIES - t.fee }; }
      t.fee++;
      const left = MAX_TRIES - t.fee;
      if (left <= 0) breakTalks(w, playerId);
      autosave(w);
      bump();
      return { ...r, left, broken: left <= 0 };
    },

    setRole(playerId, role) {
      const w = get().world!;
      changeRole(w, w.players[playerId], role);
      autosave(w); bump();
    },
    sign(playerId, wage, years, role, clause) {
      const w = get().world!;
      const p = w.players[playerId];
      const ban = talkBanned(w, playerId);
      if (ban) return { ok: false, reason: `협상이 결렬된 선수입니다. ${ban.slice(5).replace('-', '/')}까지 다시 협상할 수 없습니다` };
      if (p.clubId && !windowOpen(w.season, w.date)) return { ok: false, reason: '이적시장이 닫혀 있습니다 (자유계약 선수만 가능)' };
      const t = talkOf(w, playerId);
      if (p.clubId && t.agreed == null) return { ok: false, reason: '먼저 구단과 이적료를 합의해야 합니다' };
      const fee = p.clubId ? t.agreed! : 0;
      // 주급 한도: 계약 후 주급 합계가 주급 예산을 넘으면 안 됨 (기회는 줄지 않음)
      const room = wageRoom(w, w.userClubId);
      if (wage > room) return { ok: false, reason: `주급 예산 초과 — 남은 주급 여유 ${Math.max(0, Math.round(room / 1000))}K 유로. 선수를 팔거나 방출해 주급을 줄여야 합니다` };
      // 재정 규정 (샐러리 캡): 주급 + 이적료 상각 (이적료 ÷ 계약 연수) — AI와 같은 규칙
      const rule = withinRules(w, w.userClubId, wage, fee, years);
      if (!rule.ok) return { ok: false, reason: rule.reason! };
      if (clause === 0 && buyoutMandatory(w, w.userClubId)) return { ok: false, reason: '이 리그는 모든 선수 계약에 바이아웃이 있어야 합니다' };
      const r = playerWillJoin(w, p, w.userClubId, wage, role, clause);
      if (!r.ok) {
        // 주급이 낮으면 기회 1번 소모, 구단 자체가 싫다면 바로 결렬
        if (r.low) t.wage++;
        const left = r.low ? MAX_TRIES - t.wage : 0;
        if (left <= 0) breakTalks(w, playerId);
        autosave(w);
        bump();
        return { ok: false, reason: r.reason, left, broken: left <= 0 };
      }
      const from = p.clubId;
      const ev = completeTransfer(w, p, w.userClubId, fee, wage, years);
      if (role) p.role = role;   // 약속한 역할
      if (clause != null) setBuyout(p, clause);   // 계약에 건 바이아웃
      w.inbox.push(ev);
      set({ ceremony: { player: p.id, playerName: p.name, from, to: w.userClubId, fee, wage, years, kind: 'in' } });
      autosave(w);
      bump();
      return { ok: true, reason: '계약을 마쳤습니다' };
    },

    precontract(playerId, wage, years, role, clause) {
      const w = get().world!;
      const p = w.players[playerId];
      if (!bosmanEligible(w, p, w.userClubId)) return { ok: false, reason: '보스만 사전 계약은 계약 마지막 6개월(1월 1일부터) · 다른 나라 구단만 가능합니다' };
      const ban = talkBanned(w, playerId);
      if (ban) return { ok: false, reason: `협상이 결렬된 선수입니다. ${ban.slice(5).replace('-', '/')}까지 다시 협상할 수 없습니다` };
      if (clause === 0 && buyoutMandatory(w, w.userClubId)) return { ok: false, reason: '이 리그는 모든 선수 계약에 바이아웃이 있어야 합니다' };
      const room = wageRoom(w, w.userClubId);
      if (wage > room) return { ok: false, reason: `주급 예산 초과 — 남은 주급 여유 ${Math.max(0, Math.round(room / 1000))}K 유로` };
      const t = talkOf(w, playerId);
      const r = playerWillJoin(w, p, w.userClubId, wage, role, clause, true);
      if (!r.ok) {
        if (r.low) t.wage++;
        const left = r.low ? MAX_TRIES - t.wage : 0;
        if (left <= 0) breakTalks(w, playerId);
        autosave(w); bump();
        return { ok: false, reason: r.reason, left, broken: left <= 0 };
      }
      signPrecontract(w, p, w.userClubId, wage, years, { role, buyout: clause });
      if (w.talks) delete w.talks[playerId];
      w.inbox.push({ type: 'bosman', date: w.date, player: p.id, to: w.userClubId, mine: true });
      autosave(w); bump();
      return { ok: true, reason: '사전 계약을 맺었습니다 · 7월에 합류합니다' };
    },

    setCaptain(playerId) {
      const w = get().world!;
      w.clubs[w.userClubId].captain = playerId ?? undefined;
      autosave(w); bump();
    },
    holdMeeting() {
      const w = get().world!;
      if (!meetingReady(w)) return { ok: false, text: '팀 미팅은 30일에 한 번만 열 수 있습니다' };
      const r = teamMeeting(w, createRng((w.rng ^ 0x7ea3) >>> 0));
      w.inbox.push({ type: 'locker', date: w.date, kind: r.ok ? 'meetingOk' : 'meetingBad', players: [] });
      autosave(w); bump();
      return r;
    },

    clearDeadline() {
      const w = get().world!;
      w.deadlineAlert = undefined;
      bump();
    },

    clearRenewals() {
      const w = get().world!;
      w.pendingRenewals = undefined;
      autosave(w);
      bump();
    },

    renew(playerId, wage, years, clause) {
      const w = get().world!;
      const p = w.players[playerId];
      const key = `renew:${playerId}`;
      const ban = talkBanned(w, key);
      if (ban) return { ok: false, reason: `재계약 협상이 결렬됐습니다. ${ban.slice(5).replace('-', '/')} 이후 다시 시도할 수 있습니다` };
      // 주급이 오르는 만큼만 주급 예산에서 확인
      const room = wageRoom(w, w.userClubId);
      if (wage - p.wage > room) return { ok: false, reason: `주급 예산 초과 — 남은 주급 여유 ${Math.max(0, Math.round(room / 1000))}K 유로` };
      const t = talkOf(w, key);
      if (clause === 0 && buyoutMandatory(w, w.userClubId)) return { ok: false, reason: '이 리그는 모든 선수 계약에 바이아웃이 있어야 합니다' };
      const r = evaluateRenewal(w, p, wage, years, clause);
      if (!r.ok) {
        if (r.low) t.wage++;
        const left = r.low ? MAX_TRIES - t.wage : 0;
        if (left <= 0) { (w.talkBan ??= {})[key] = addDaysIso(w.date, 30); if (w.talks) delete w.talks[key]; }
        autosave(w); bump();
        return { ok: false, reason: r.reason, left, broken: left <= 0 };
      }
      applyRenewal(w, p, wage, years, clause);
      if (w.talks) delete w.talks[key];
      autosave(w); bump();
      return { ok: true, reason: `재계약 완료 · ${p.contract!.slice(0, 4)}년 6월까지` };
    },

    toggleShortlist(playerId) {
      const w = get().world!;
      const s = (w.shortlist ??= []);
      w.shortlist = s.includes(playerId) ? s.filter((x) => x !== playerId) : [...s, playerId];
      bump();
    },

    toggleTransferList(playerId) {
      const w = get().world!;
      const s = (w.transferList ??= []);
      w.transferList = s.includes(playerId) ? s.filter((x) => x !== playerId) : [...s, playerId];
      autosave(w);
      bump();
    },

    release(playerId) {
      const w = get().world!;
      // 빌려 온 선수는 방출 대신 원소속 구단으로 돌려보냄
      if (w.players[playerId].loan) { const e = loanReturn(w, w.players[playerId]); if (e) w.inbox.push(e); } else releasePlayer(w, w.players[playerId]);
      const c = w.clubs[w.userClubId];
      if (c.lineup) c.lineup = { starters: c.lineup.starters.map((x) => (x === playerId ? null : x)), bench: c.lineup.bench.filter((x) => x !== playerId) };
      autosave(w);
      bump();
    },

    answerOffer(offerId, accept) {
      const w = get().world!;
      const o = (w.offers ?? []).find((x) => x.id === offerId);
      if (!o || !offerValid(w, o)) { cleanOffers(w); w.offers = (w.offers ?? []).filter((x) => x.id !== offerId); bump(); return '이미 끝난 제안입니다 (선수가 팀을 떠났거나 기한 · 이적시장이 끝났습니다)'; }
      w.offers = (w.offers ?? []).filter((x) => x.id !== offerId);
      const msg = accept ? sellTo(o).msg : '제안을 거절했습니다';
      autosave(w);
      bump();
      return msg;
    },

    counter(offerId, ask) {
      const w = get().world!;
      const o = (w.offers ?? []).find((x) => x.id === offerId);
      if (!o || !offerValid(w, o)) { cleanOffers(w); w.offers = (w.offers ?? []).filter((x) => x.id !== offerId); bump(); return { result: 'gone', fee: 0, reason: '이미 끝난 제안입니다 (선수가 팀을 떠났거나 기한 · 이적시장이 끝났습니다)' }; }
      const r = counterOffer(w, o, ask);
      let out: ReturnType<GameStore['counter']> = r;
      if (r.result === 'accept') {
        w.offers = (w.offers ?? []).filter((x) => x.id !== offerId);
        const s = sellTo(o);
        out = { ...r, reason: `${r.reason} · ${s.msg}`, done: s.ok };
      }
      autosave(w);
      bump();
      return out;
    },

    async nextSeason() {
      const w = get().world;
      if (!w || !seasonOver(w)) return;
      set({ loading: true });
      closeSeason(w);
      const input = await loadSeasonInput(nextSeasonOf(w.season));
      const report = startNextSeason(w, input);
      registerGeneratedNames(w.players);   // 유스 선수 한국어 이름
      const awards = w.pendingAwards?.length ? w.pendingAwards : null;
      const news = w.pendingNews?.length ? w.pendingNews : null;
      w.pendingAwards = undefined;
      w.pendingNews = undefined;
      set({ loading: false, seasonReport: report, awards, news });
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

    async exportFile() {
      const w = get().world;
      if (!w) return;
      recordCareer(w);
      await exportSaveFile(w, clubKo(w.userClubId));
    },
    async importFile(file) {
      try {
        const world = await readSaveFile(file);
        await writeSave('auto', world);   // 자동 저장 슬롯에 넣고 (데이터가 다르면 바꾼 뒤 이어서) 불러온다
        return await get().load('auto');
      } catch (e) { set({ loadError: e instanceof Error ? e.message : String(e) }); return false; }
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
      // 데이터 형식이 바뀌기 전에 만든 세이브 (구단을 찾을 수 없음)
      if (!clubMasters.has(world.userClubId) || !Object.keys(world.clubs).every((id) => clubMasters.has(id) || !world.competitions[world.clubs[id].league])) {
        set({ loadError: '이전 형식의 데이터로 만든 세이브라 불러올 수 없습니다. 새 게임으로 시작해 주세요.' });
        return false;
      }
      set({ loadError: null });
      world.careerId ??= newCareerId();
      fillContracts(world);
      registerGeneratedNames(world.players);   // 유스 선수 한국어 이름
      syncWorld(world);
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
// 개발 모드 전용: 브라우저 테스트에서 상태를 직접 확인 · 설정
if (import.meta.env.DEV) (window as unknown as { __game: typeof useGame }).__game = useGame;
if (import.meta.hot) import.meta.hot.accept(() => location.reload());
