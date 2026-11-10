// 선수 언론 플레이 대응 창: 연봉 인상 요구 · 이적 요청 · 태업 단계 → 대화 · 약속 · 징계 · 공개 비판 · 판매 허락
import { useState } from 'react';
import { SAGA_STAGE_KO, type SagaAction } from '../../engine/saga';
import { overall } from '../../engine/ratings';
import { clubKo, playerKo } from '../../data/db';
import { useGame } from '../../store/game';
import { money } from '../format';
import { useWorld } from '../hooks';
import { Crest } from './Crest';

const STAGE_TEXT = [
  '에이전트가 언론에 선수의 뜻을 흘렸습니다.',
  '선수가 인터뷰에서 공개적으로 불만을 말했습니다. 팀 분위기가 흔들립니다.',
  '선수가 훈련에 나오지 않습니다. 경기 감각과 능력이 떨어지고 팀 분위기도 나빠집니다.',
  '선수가 경기 출전을 거부합니다. 선발로 쓸 수 없습니다.',
];

export function SagaModal() {
  const w = useWorld();
  const id = w.sagaPrompt;
  const { sagaRespond, sagaClose } = useGame();
  const [msg, setMsg] = useState('');
  const p = id ? w.players[id] : null;
  const s = p?.saga;
  if (!p || !s || p.clubId !== w.userClubId || w.manager?.pendingJob) return null;
  const name = playerKo(p.id, p.name);
  const opts: { a: SagaAction; label: string; hint: string }[] = [
    { a: 'talk', label: '직접 대화한다', hint: '충성도 · 프로의식이 높으면 한발 물러섬 · 안 통하면 더 커짐' },
    { a: 'promise', label: s.kind === 'wage' ? '"60일 안에 재계약하겠다"' : '"시즌이 끝나면 보내 주겠다"', hint: '태업 멈춤 · 지키지 않으면 사기 · 충성도 크게 −' },
    { a: 'fine', label: '벌금 징계', hint: '다른 선수 사기 + · 프로의식이 낮으면 더 반발' },
    { a: 'criticize', label: '기자회견에서 공개 비판', hint: '팬 여론 + · 선수 사기 · 충성도 크게 −' },
    ...(s.kind === 'move' ? [{ a: 'list' as SagaAction, label: '이적을 허락한다 (이적 명단)', hint: '태업 멈춤 · 제안을 받아 팔 수 있음' }] : []),
  ];
  return (
    <div className="fixed inset-0 z-[63] grid animate-[fade_0.2s_ease-out] place-items-center bg-ink-950/85 p-6 backdrop-blur-sm">
      <div className="panel w-full max-w-[560px] overflow-hidden">
        <div className="px-7 pt-7 pb-4">
          <div className="flex items-center justify-between text-[12px]"><span className="font-semibold text-amber">선수 · {s.kind === 'wage' ? '연봉 인상 요구' : '이적 요청'}</span><span className="text-lo">{SAGA_STAGE_KO[s.stage]} ({s.stage}/3)</span></div>
          <h2 className="mt-2 text-[19px] leading-snug font-semibold">
            {s.kind === 'wage' ? `${name}: "지금 주급으로는 남을 수 없다"` : `${name}: "${clubKo(s.target ?? '')}로 가고 싶다"`}
          </h2>
          <div className="mt-2 text-[13px] text-mid">{STAGE_TEXT[s.stage]}</div>
          <div className="mt-3 flex items-center gap-3 rounded-lg bg-ink-900 px-3 py-2 text-[12px] text-mid">
            <span>능력 <b className="text-hi">{overall(p)}</b></span><span>주급 {money(p.wage)}</span>
            {s.kind === 'wage' && <span>요구 <b className="text-amber">{money(s.wantWage ?? 0)}</b>/주 (재계약하면 끝)</span>}
            {s.kind === 'move' && s.target && <span className="flex items-center gap-1.5"><Crest clubId={s.target} size={14} />{clubKo(s.target)}가 제안을 넣습니다</span>}
          </div>
        </div>
        <div className="space-y-1.5 px-7 pb-4">
          {opts.map((o) => (
            <button key={o.a} onClick={() => setMsg(sagaRespond(p.id, o.a))} className="w-full rounded-xl bg-ink-900 px-4 py-2.5 text-left transition-colors hover:bg-ink-800">
              <div className="text-[14px] font-semibold">{o.label}</div>
              <div className="mt-0.5 text-[12px] text-lo">{o.hint}</div>
            </button>
          ))}
          {msg && <div className="pt-1 text-[12px] text-neon">{msg}</div>}
        </div>
        <div className="border-t border-line px-7 py-3 text-right">
          <button onClick={sagaClose} className="text-[12px] text-lo hover:text-hi">지금은 두고 보기</button>
        </div>
      </div>
    </div>
  );
}
