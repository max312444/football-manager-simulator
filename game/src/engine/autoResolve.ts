// 팝업을 끈 종류는 무난한 선택으로 자동 처리 (결과만 받은편지함에)
//  기자회견: 노코멘트 (없으면 가운데 답) · 이사회 이벤트: 갈등이 적은 쪽 · 선수 언론 플레이: 대화 · 선수 논란: 내부 징계
import type { GameEvent, World } from './types';
import type { Rng } from './rng';
import { popupOff } from './gameSettings';
import { answerPress } from './press';
import { resolveBoardEvent } from './boardEvents';
import { sagaRespond } from './saga';
import { scandalRespond } from './scandal';

const BOARD_SAFE: Record<string, string> = { sellStar: 'accept', youth: 'accept', wanted: 'refuse', rumour: 'silent', protest: 'talk' };

export function autoResolve(w: World, rng: Rng): GameEvent[] {
  const out: GameEvent[] = [];
  const m = w.manager;
  const note = (text: string) => out.push({ type: 'info', date: w.date, text: `(자동 처리) ${text}` });
  if (m?.press && popupOff(w, 'press')) {
    for (let i = 0; i < 5 && m.press; i++) {
      const q = m.press.questions[0];
      const key = q?.answers.find((a) => a.key === 'nocomment')?.key ?? q?.answers[1]?.key ?? 'skip';
      answerPress(w, key);
    }
    note('기자회견에서 무난하게 답했습니다');
  }
  if (m?.boardEvent && popupOff(w, 'board')) {
    const ev = m.boardEvent;
    const key = BOARD_SAFE[ev.kind] ?? ev.options[0].key;
    out.push(...resolveBoardEvent(w, ev.options.some((o) => o.key === key) ? key : ev.options[0].key).map((e) => (e.type === 'info' ? { ...e, text: `(자동 처리) ${e.text}` } : e)));
  }
  if (w.sagaPrompt && popupOff(w, 'saga')) {
    const r = sagaRespond(w, w.sagaPrompt, 'talk', rng);
    w.sagaPrompt = undefined;
    if (r.text) note(r.text);
  }
  if (w.scandalPrompt && popupOff(w, 'scandal')) {
    const r = scandalRespond(w, 'fine', rng);
    if (r.text) note(r.text);
  }
  return out;
}
