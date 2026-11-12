// 설정 창: 진행 · 알림 / 팝업 · 난이도 · 경기 · 저장 · 화면 (첫 화면 · 게임 안 사이드바)
import type { ReactNode } from 'react';
import { DEFAULT_SETTINGS, syncWorld, useSettings, type Settings } from '../../store/settings';
import { useGame } from '../../store/game';
import type { Freq, PopupKind } from '../../engine/gameSettings';

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex shrink-0 gap-1 rounded-lg bg-ink-900 p-1">
      {options.map(([v, label]) => (
        <button key={String(v)} onClick={() => onChange(v)}
          className={`h-7 rounded-md px-2.5 text-[12px] whitespace-nowrap transition-colors ${value === v ? 'bg-ink-700 font-semibold text-hi' : 'text-mid hover:text-hi'}`}>{label}</button>
      ))}
    </div>
  );
}
function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-stretch gap-2 py-2.5 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1"><div className="text-[13px]">{label}</div>{hint && <div className="text-[11px] text-lo">{hint}</div>}</div>
      {children}
    </div>
  );
}
const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section><div className="mb-1 text-[12px] font-semibold text-neon">{title}</div><div className="divide-y divide-line">{children}</div></section>
);

const FREQ: [Freq, string][] = [['off', '끄기'], ['rare', '드물게'], ['normal', '보통'], ['often', '자주']];
const POPUPS: [PopupKind, string, string][] = [
  ['press', '기자회견', '끄면 무난하게 답한 것으로 처리'],
  ['board', '이사회 이벤트', '끄면 갈등이 적은 쪽으로 처리'],
  ['scandal', '선수 논란', '끄면 내부 징계로 처리'],
  ['saga', '선수 언론 플레이 (연봉 · 이적 요구)', '끄면 대화로 처리'],
];

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { s, set, reset } = useSettings();
  const world = useGame((g) => g.world);
  const change = (c: Partial<Settings>) => { set(c); syncWorld(world, { ...s, ...c, popups: { ...s.popups, ...(c.popups ?? {}) } }); };
  return (
    <div className="fixed inset-0 z-[90] grid animate-[fade_0.2s_ease-out] place-items-center bg-ink-950/85 p-2 sm:p-6 backdrop-blur-sm" onClick={onClose}>
      <div className="panel flex max-h-full w-full max-w-[680px] flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-line px-4 sm:px-7 py-4">
          <h2 className="text-[17px] font-semibold">설정</h2>
          <div className="flex items-center gap-4">
            <button onClick={() => { reset(); syncWorld(world, DEFAULT_SETTINGS); }} className="text-[12px] text-lo hover:text-hi">기본값으로</button>
            <button onClick={onClose} className="text-[13px] text-lo hover:text-hi">닫기</button>
          </div>
        </header>
        <div className="space-y-6 overflow-auto px-4 sm:px-7 py-5">
          <Section title="진행">
            <Row label="'계속'이 멈추는 곳" hint="중요한 일만: 큰 경기 · 이사회 · 기자회견 · 논란 · 부상 때만 멈추고 나머지 경기는 결과만">
              <Seg value={s.stopAt} options={[['match', '내 경기마다'], ['important', '중요한 일만'], ['window', '이적시장 · 시즌 끝']]} onChange={(v) => change({ stopAt: v })} />
            </Row>
          </Section>

          <Section title="알림 · 팝업">
            {POPUPS.map(([k, label, hint]) => (
              <Row key={k} label={label} hint={hint}>
                <Seg value={s.popups[k]} options={FREQ} onChange={(v) => change({ popups: { ...s.popups, [k]: v } })} />
              </Row>
            ))}
          </Section>

          <Section title="난이도">
            <Row label="이사회 인내심" hint="경질 · 재계약 거절 기준과 성적 부진 때 신뢰도가 떨어지는 속도">
              <Seg value={s.patience} options={[['lenient', '너그러움'], ['normal', '보통'], ['strict', '엄격']]} onChange={(v) => change({ patience: v })} />
            </Row>
            <Row label="재정 규정" hint="내 구단 선수단 비용 한도 (너그러움 +15% · 엄격 −10%)">
              <Seg value={s.rules} options={[['relaxed', '너그러움'], ['normal', '보통'], ['strict', '엄격']]} onChange={(v) => change({ rules: v })} />
            </Row>
            <Row label="이적 협상" hint="파는 구단의 요구 금액 · 선수가 우리 구단에 올 마음">
              <Seg value={s.transfers} options={[['easy', '쉬움'], ['normal', '보통'], ['hard', '어려움']]} onChange={(v) => change({ transfers: v })} />
            </Row>
            <Row label="스카우트" hint="켬: 다른 구단 선수 능력치가 아는 만큼만 범위로 보임 (스카우트를 보내면 정확히) · 끔: 모두 정확히">
              <Seg value={s.scoutFog === false ? 'off' : 'on'} options={[['on', '켬'], ['off', '끔']]} onChange={(v) => change({ scoutFog: v === 'on' })} />
            </Row>
          </Section>

          <Section title="경기">
            <Row label="경기 방식" hint="결과만: 스쿼드 설정 없이 AI 추천 선발로 바로 결과">
              <Seg value={s.matchMode} options={[['manage', '직접 지휘'], ['result', '결과만 보기']]} onChange={(v) => change({ matchMode: v })} />
            </Row>
            <Row label="경기 화면 기본 속도">
              <Seg value={s.matchSpeed} options={[[0, '보통'], [1, '빠르게'], [2, '매우 빠르게']]} onChange={(v) => change({ matchSpeed: v })} />
            </Row>
          </Section>

          <Section title="저장">
            <Row label="자동 저장" hint="저장 슬롯 정리는 '불러오기 · 저장하기' 창에서 삭제">
              <Seg value={s.autosave} options={[['day', '진행할 때마다'], ['week', '1주마다'], ['month', '1달마다'], ['off', '안 함']]} onChange={(v) => change({ autosave: v })} />
            </Row>
          </Section>

          <Section title="화면">
            <Row label="글자 크기">
              <Seg value={s.fontScale} options={[[0.9, '작게'], [1, '보통'], [1.1, '크게'], [1.2, '아주 크게']]} onChange={(v) => change({ fontScale: v })} />
            </Row>
            <Row label="선수 이름 표기" hint="짧은 이름: 주로 성 (예: 살라 · 판데이크)">
              <Seg value={s.names} options={[['full', '전체 이름'], ['short', '짧은 이름']]} onChange={(v) => change({ names: v })} />
            </Row>
          </Section>
        </div>
      </div>
    </div>
  );
}
