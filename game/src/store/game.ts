// 게임 진행 상태: 월드(엔진 상태) + 진행 중인 사용자 경기.
// 엔진은 월드를 직접 수정하므로, 화면 갱신은 rev 숫자를 올려서 알린다.
import { create } from 'zustand';
import type { Fixture, GameEvent, Side, Tactics, World } from '../engine/types';
import { advanceDay, advanceToUserMatch, applyMatch, createWorld, prepareMatch, type SeasonInput } from '../engine/world';
import { playToEnd, setTactics, step, substitute, type MatchState } from '../engine/match';
import { createRng, type Rng } from '../engine/rng';
import { seedTraits } from '../engine/traits';
import { availableSeasons, clubs as clubMasters, dataset, leagues, loadHistory, loadLeagueSeason, loadStandings, realAvailable, registerGeneratedNames, setDataset, worldCupsMeta } from '../data/db';
import { closeSeason, nextSeasonOf, startNextSeason, type SeasonReport } from '../engine/season';
import { fillContracts, seasonOver } from '../engine/world';
import { recommend, type Recommendation } from '../engine/ai';
import { withinRules } from '../engine/rules';
import { trainingOf, type Training } from '../engine/training';
import { acceptOffer, chooseJob, declineOffer, ensureManager } from '../engine/manager';
import { askBoard, type BoardAsk } from '../engine/board';
import { resolveBoardEvent } from '../engine/boardEvents';
import { answerPress } from '../engine/press';
import { sagaRespond, type SagaAction } from '../engine/saga';
import { scandalRespond, type ScandalAction } from '../engine/scandal';
import { breakTalks, cleanOffers, completeTransfer, counterOffer, offerValid, evaluateBid, MAX_TRIES, playerWillJoin, releasePlayer, talkBanned, talkOf, wageDemand, wageRoom, windowOpen, type BidResult } from '../engine/transfer';
import type { RetireNews, TransferOffer } from '../engine/types';
import { applyRenewal, evaluateRenewal } from '../engine/contract';
const addDaysIso = (iso: string, n: number) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
import { matchRules, pickLineup } from '../engine/squad';
import type { Mentality, Pressing } from '../engine/types';
import { readSave, writeSave } from './save';
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
  /** 불러오기 실패 이유 (화면 안내용) */
  loadError: string | null;
  /** 이적 확정 연출 */
  ceremony: Ceremony | null;
  closeCeremony(): void;
  nextSeason(): Promise<void>;
  dismissReport(): void;
  save(slot: string): Promise<void>;
  load(slot: string): Promise<boolean>;
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
  renew(playerId: string, wage: number, years: number): { ok: boolean; reason: string; left?: number; broken?: boolean };
  /** 개인 계약 제안 (이적료는 합의된 금액, 자유계약은 0) */
  sign(playerId: string, wage: number, years: number): { ok: boolean; reason: string; left?: number; broken?: boolean };
  toggleShortlist(playerId: string): void;
  toggleTransferList(playerId: string): void;
  release(playerId: string): void;
  answerOffer(offerId: string, accept: boolean): string;
  /** 받은 제안에 역제안 (이적료). done = 이적 성사, gone = 제안이 사라짐 */
  counter(offerId: string, ask: number): { result: 'accept' | 'raise' | 'reject' | 'withdraw' | 'gone'; fee: number; reason: string; done?: boolean };
  stepMatch(n?: number): void;
  changeTactics(t: Partial<Tactics>): void;
  sub(outId: string, inId: string): boolean;
  setClubTactics(t: Partial<Tactics>): void;
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
  sagaRespond(playerId: string, action: SagaAction): string;
  sagaClose(): void;
  sagaOpen(playerId: string): void;
  /** 선수 논란 대응 */
  scandalRespond(action: ScandalAction): string;
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
    world: null, rev: 0, loading: false, match: null, lastEvents: [], seasonReport: null, savedAt: null, loadError: null, ceremony: null, awards: null, news: null,

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
      set({ world, loading: false, match: null, lastEvents: [], seasonReport: null });
      autosave(world);
      bump();
    },

    continueGame() {
      const w = get().world;
      if (!w || get().match || w.manager?.pendingJob) return;   // 감독: 새 구단을 골라야 하면 진행 멈춤
      const { events, matchToday } = advanceToUserMatch(w);
      registerGeneratedNames(w.players);   // 월드컵 국내파 가상 선수 한국어 이름
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
    sagaRespond(playerId, action) {
      const w = get().world;
      if (!w) return '';
      const rng = createRng((w.rng ^ 0x5a6a) >>> 0);
      const r = sagaRespond(w, playerId, action, rng);
      w.rng = (w.rng + 7) >>> 0;
      w.inbox.push(...r.events);
      w.sagaPrompt = undefined;
      autosave(w);
      bump();
      return r.text;
    },
    scandalRespond(action) {
      const w = get().world;
      if (!w) return '';
      const rng = createRng((w.rng ^ 0x5c4d) >>> 0);
      const r = scandalRespond(w, action, rng);
      w.rng = (w.rng + 11) >>> 0;
      w.inbox.push(...r.events);
      autosave(w);
      bump();
      return r.text;
    },
    sagaClose() { const w = get().world; if (!w) return; w.sagaPrompt = undefined; bump(); },
    sagaOpen(playerId) { const w = get().world; if (!w) return; w.sagaPrompt = playerId; bump(); },
    pressAnswer(key) {
      const w = get().world;
      if (!w) return;
      w.inbox.push(...answerPress(w, key));
      autosave(w);
      bump();
    },
    boardChoose(key) {
      const w = get().world;
      if (!w) return;
      w.inbox.push(...resolveBoardEvent(w, key));
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

    sign(playerId, wage, years) {
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
      const r = playerWillJoin(w, p, w.userClubId, wage);
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
      w.inbox.push(ev);
      set({ ceremony: { player: p.id, playerName: p.name, from, to: w.userClubId, fee, wage, years, kind: 'in' } });
      autosave(w);
      bump();
      return { ok: true, reason: '계약을 마쳤습니다' };
    },

    clearRenewals() {
      const w = get().world!;
      w.pendingRenewals = undefined;
      autosave(w);
      bump();
    },

    renew(playerId, wage, years) {
      const w = get().world!;
      const p = w.players[playerId];
      const key = `renew:${playerId}`;
      const ban = talkBanned(w, key);
      if (ban) return { ok: false, reason: `재계약 협상이 결렬됐습니다. ${ban.slice(5).replace('-', '/')} 이후 다시 시도할 수 있습니다` };
      // 주급이 오르는 만큼만 주급 예산에서 확인
      const room = wageRoom(w, w.userClubId);
      if (wage - p.wage > room) return { ok: false, reason: `주급 예산 초과 — 남은 주급 여유 ${Math.max(0, Math.round(room / 1000))}K 유로` };
      const t = talkOf(w, key);
      const r = evaluateRenewal(w, p, wage, years);
      if (!r.ok) {
        if (r.low) t.wage++;
        const left = r.low ? MAX_TRIES - t.wage : 0;
        if (left <= 0) { (w.talkBan ??= {})[key] = addDaysIso(w.date, 30); if (w.talks) delete w.talks[key]; }
        autosave(w); bump();
        return { ok: false, reason: r.reason, left, broken: left <= 0 };
      }
      applyRenewal(w, p, wage, years);
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
      releasePlayer(w, w.players[playerId]);
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
      fillContracts(world);
      registerGeneratedNames(world.players);   // 유스 선수 한국어 이름
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
