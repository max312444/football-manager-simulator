// 잘린 글자 흐르기: 말줄임(truncate)으로 잘린 칸을 찾아, 보이는 데까지 보여 준 뒤 천천히 끝까지 흘려 보여 주고 다시 처음으로
//  화면 전체에 자동 적용 (컴포넌트를 하나하나 고치지 않아도 됨). 잘리지 않으면 그대로
//  - 방법: 칸 안의 글자를 text-indent 로 밀어 낸다 (.mq-run, styles.css). 밀 거리 --mq · 시간은 길이에 비례
//  - 화면이 바뀔 때마다(요소 추가 · 크기 변화) 0.6초 안에 한 번 다시 검사. 글자 · 칸 너비가 그대로면 다시 재지 않음 (흐름이 끊기지 않게)
//  - 기기 설정 '동작 줄이기' 면 하지 않음 · data-no-marquee 가 붙은 칸은 제외
const SPEED = 28;      // 초당 px

function scan() {
  for (const el of document.querySelectorAll<HTMLElement>('.truncate')) {
    if (el.closest('[data-no-marquee]')) continue;
    const key = `${el.clientWidth}|${el.textContent}`;
    if (el.dataset.mq === key) continue;            // 바뀐 게 없음
    el.dataset.mq = key;
    el.classList.remove('mq-run');                  // 흐르기 없이 원래 넓이를 잰다
    const over = el.scrollWidth - el.clientWidth;
    if (over > 4 && el.clientWidth > 24) {
      const dist = over + 6;
      // 한 번 왕복 = 처음 멈춤 15% · 끝까지 30% · 끝 멈춤 15% · 돌아오기 30% · 멈춤 10% (styles.css @keyframes mq)
      const total = Math.max(5, dist / SPEED / 0.3);
      el.style.setProperty('--mq', `-${dist}px`);
      el.style.setProperty('--mq-t', `${total.toFixed(2)}s`);
      el.classList.add('mq-run');
    }
  }
}

let timer = 0;
const schedule = () => { if (!timer) timer = window.setTimeout(() => { timer = 0; scan(); }, 600); };

export function startMarquee() {
  if (typeof window === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true });
  window.addEventListener('resize', schedule);
  schedule();
}
