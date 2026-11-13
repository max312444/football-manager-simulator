// 재정 화면: 스폰서 계약 (메인 · 용품) · 받은 제안 고르기
import { ensureSponsors, KIND_KO, SLOT_KO, type SponsorBonus, type SponsorDeal } from '../../engine/sponsors';
import { useGame } from '../../store/game';
import { useWorld } from '../hooks';
import { money } from '../format';
import { Card } from './bits';

const BONUS_KO: [keyof SponsorBonus, string][] = [['title', '리그 우승'], ['top4', '4위 안'], ['cup', '국내 컵 우승'], ['euro', '유럽 대회 우승']];
const until = (d: string) => `${d.slice(0, 4)}년 6월까지`;

function Bonus({ b }: { b?: SponsorBonus }) {
  if (!b) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {BONUS_KO.filter(([k]) => b[k]).map(([k, label]) => <span key={k} className="rounded bg-neon/10 px-1.5 py-0.5 text-[11px] text-neon">{label} +{money(b[k]!)}</span>)}
    </div>
  );
}

export function SponsorCard() {
  const w = useWorld();
  const sign = useGame((s) => s.signSponsor);
  const c = w.clubs[w.userClubId];
  const deals = ensureSponsors(w, c);
  const offers = w.sponsorOffers ?? [];
  const seasonEnd = `${+w.season.slice(0, 4) + 1}-06-30`;
  const total = deals.reduce((s, d) => s + d.value, 0);
  return (
    <Card title="스폰서" action={<span className="text-[12px] text-lo">계약 연 {money(total)} · 매달 나눠 입금</span>}>
      <div className="grid gap-px bg-line sm:grid-cols-2">
        {(['shirt', 'kit'] as const).map((slot) => {
          const d = deals.find((x) => x.slot === slot) as SponsorDeal | undefined;
          const ending = d && d.until <= seasonEnd;
          return (
            <div key={slot} className="bg-ink-900 px-5 py-4">
              <div className="text-[12px] text-lo">{SLOT_KO[slot]}</div>
              {d ? (
                <>
                  <div className="mt-1 text-[16px] font-semibold">{d.name}</div>
                  <div className="tnum mt-0.5 text-[13px] text-mid">연 {money(d.value)} · {KIND_KO[d.kind]} · <span className={ending ? 'text-amber' : ''}>{until(d.until)}{ending ? ' (이번 시즌 만료)' : ''}</span></div>
                  <Bonus b={d.bonus} />
                </>
              ) : <div className="mt-1 text-[13px] text-lo">계약 없음</div>}
            </div>
          );
        })}
      </div>
      {(['shirt', 'kit'] as const).map((slot) => {
        const list = offers.filter((o) => o.slot === slot);
        if (!list.length) return null;
        return (
        <div key={slot} className="border-t border-line px-5 py-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[12px]">
            <span className="font-semibold text-[#f2c94c]">{SLOT_KO[slot]} 새 계약 제안 · {list[0].expires.slice(5).replace('-', '.')}까지 고르기</span>
            <span className="text-lo">이번 시즌 성적 · 명성 · 팬 여론으로 금액이 정해졌습니다 · 안 고르면 고정형으로 자동 계약</span>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {list.map((o) => {
              const years = +o.until.slice(0, 4) - (+w.season.slice(0, 4) + 1);
              return (
                <div key={o.id} className="flex flex-col rounded-lg bg-ink-900 p-4 ring-1 ring-line">
                  <div className="flex items-center justify-between text-[12px]"><span className="rounded bg-ink-700 px-1.5 py-0.5 font-semibold text-mid">{KIND_KO[o.kind]}</span><span className="text-lo">{years}년</span></div>
                  <div className="mt-2 text-[15px] font-semibold">{o.name}</div>
                  <div className="tnum mt-1 text-[20px] font-semibold text-neon">연 {money(o.value)}</div>
                  <div className="text-[12px] text-lo">{years}년 합계 {money(o.value * years)}{o.bonus ? ' + 성과 보너스' : ''}</div>
                  <Bonus b={o.bonus} />
                  <div className="mt-2 flex-1 text-[12px] leading-relaxed text-lo">
                    {o.kind === 'fixed' ? '성적과 상관없이 정해진 금액' : o.kind === 'bonus' ? '고정 금액은 낮지만 우승 · 상위권이면 보너스' : '조금 덜 받는 대신 5년 동안 안정적'}
                  </div>
                  <button onClick={() => sign(o.id)} className="mt-3 h-10 rounded-lg bg-neon text-[13px] font-semibold text-ink-950 hover:bg-[#5bff3d]">이 조건으로 계약</button>
                </div>
              );
            })}
          </div>
        </div>
        );
      })}
    </Card>
  );
}
