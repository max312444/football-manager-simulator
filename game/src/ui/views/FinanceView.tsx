// 재정 화면: 잔고 · 예산 · 이번 시즌 수입/지출 · 잔고 추이 · 지난 시즌 장부
import { EXPENSE_LABEL, INCOME_LABEL, ledgerOf, revenueBase, sum, wageBillOf, type ExpenseKind, type IncomeKind } from '../../engine/finance';
import { useWorld } from '../hooks';
import { baseFans, fanFactor, fansOf } from '../../engine/awards';
import { Card } from '../components/bits';
import { money } from '../format';

const signed = (v: number) => (v < 0 ? '−' : '+') + money(Math.abs(v));

export function FinanceView() {
  const w = useWorld();
  const club = w.clubs[w.userClubId];
  const f = club.finance;
  const ledger = ledgerOf(w);
  const cur = ledger.current;
  const inc = sum(cur.income), exp = sum(cur.expense), net = inc - exp;
  const bill = wageBillOf(w, club.id);
  const wageRatio = bill / Math.max(1, f.wageBudget);
  const maxRow = Math.max(1, ...Object.values(cur.income), ...Object.values(cur.expense));
  const R = revenueBase(w);
  const fans = fansOf(w, club.id), fanBase = baseFans(club.reputation), ff = fanFactor(w, club.id);

  return (
    <div className="h-full overflow-auto px-8 py-6">
      <div className="mx-auto max-w-[1180px] space-y-4">
        {/* 핵심 숫자 */}
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-4">
          <Kpi label="구단 잔고" value={money(Math.abs(f.balance))} neg={f.balance < 0} sub={f.balance < 0 ? '적자 상태 — 다음 시즌 예산이 줄어듭니다' : '이사회 예산 배정의 기준'} />
          <Kpi label="이적 예산" value={money(f.transferBudget)} sub="선수 판매 시 이적료의 50%가 다시 들어옵니다" />
          <div className="bg-ink-850 px-5 py-4">
            <div className="text-[12px] text-lo">주급 지출 / 예산</div>
            <div className={`tnum mt-1 text-[20px] font-semibold ${wageRatio > 1 ? 'text-amber' : ''}`}>{money(bill)} <span className="text-[14px] font-normal text-lo">/ {money(f.wageBudget)}</span></div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-ink-700"><div className={`h-full rounded-full ${wageRatio > 1 ? 'bg-amber' : wageRatio > 0.95 ? 'bg-mid' : 'bg-neon'}`} style={{ width: `${Math.min(1, wageRatio) * 100}%` }} /></div>
          </div>
          <Kpi label={`${cur.season.replace('-', '/')} 시즌 손익`} value={signed(net)} neg={net < 0} pos={net > 0} sub={`수입 ${money(inc)} · 지출 ${money(exp)}`} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="이번 시즌 수입">
            <div className="px-5 py-3">
              {(Object.keys(INCOME_LABEL) as IncomeKind[]).map((k) => <Bar key={k} label={INCOME_LABEL[k]} v={cur.income[k]} max={maxRow} tone="bg-neon" />)}
            </div>
          </Card>
          <Card title="이번 시즌 지출">
            <div className="px-5 py-3">
              {(Object.keys(EXPENSE_LABEL) as ExpenseKind[]).map((k) => <Bar key={k} label={EXPENSE_LABEL[k]} v={cur.expense[k]} max={maxRow} tone="bg-red" />)}
            </div>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card title="잔고 추이" action={<span className="text-[12px] text-lo">매주 월요일 기준</span>}>
            <Trend points={cur.balances} />
          </Card>
          <Card title="돈은 어떻게 움직이나">
            <div className="flex items-end justify-between border-b border-line px-5 py-4">
              <div><div className="text-[12px] text-lo">팬</div><div className="tnum mt-1 text-[20px] font-semibold">{(fans / 1e6).toFixed(2)}M 명</div></div>
              <div className="text-right text-[12px] text-lo">구단 규모 기준 대비 <span className={`tnum font-semibold ${fans >= fanBase ? 'text-neon' : 'text-red'}`}>{fans >= fanBase ? '+' : ''}{(((fans / fanBase) - 1) * 100).toFixed(1)}%</span><br />경기장 · 스폰서 수입 ×{ff.toFixed(2)}</div>
            </div>
            <ul className="space-y-2 px-5 py-4 text-[13px] leading-relaxed text-mid">
              <li>· 이기면 팬이 늘고 지면 조금 줄어듭니다. 우승하면 8%, 개인 수상자가 나오면 2% 늘어납니다.</li>
              <li>· 매주 월요일 선수 주급이 나갑니다.</li>
              <li>· 매월 1일 스폰서 수입과 운영비, 8월~5월에는 중계권료가 들어옵니다.</li>
              <li>· 홈 경기마다 입장 수입이 들어오고, 상대가 강할수록 많습니다.</li>
              <li>· 시즌이 끝나면 순위에 따라 리그 상금을 받습니다.</li>
              <li>· 새 시즌마다 이사회가 잔고와 손익을 보고 이적 · 주급 예산을 정합니다. 적자면 예산이 줄어듭니다.</li>
              <li className="text-lo">이번 시즌 예상 연 매출 약 {money(R)}</li>
            </ul>
          </Card>
        </div>

        <Card title="지난 시즌">
          {ledger.past.length === 0 ? <div className="px-5 py-6 text-[13px] text-lo">첫 시즌이 끝나면 여기에 기록됩니다</div> : (
            <table className="w-full text-[13px]">
              <thead><tr className="text-left text-[12px] text-lo">{['시즌', '수입', '지출', '손익', '시즌 말 잔고'].map((h, i) => <th key={h} className={`px-5 py-2 font-normal ${i ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
              <tbody>
                {[...ledger.past].reverse().map((s) => {
                  const a = sum(s.income), b = sum(s.expense);
                  return (
                    <tr key={s.season} className="border-t border-line">
                      <td className="px-5 py-2.5">{s.season.replace('-', '/')}</td>
                      <td className="tnum px-5 text-right">{money(a)}</td>
                      <td className="tnum px-5 text-right">{money(b)}</td>
                      <td className={`tnum px-5 text-right font-semibold ${a - b < 0 ? 'text-red' : 'text-neon'}`}>{signed(a - b)}</td>
                      <td className="tnum px-5 text-right text-mid">{s.endBalance < 0 ? '−' : ''}{money(Math.abs(s.endBalance))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, neg, pos }: { label: string; value: string; sub?: string; neg?: boolean; pos?: boolean }) {
  return (
    <div className="bg-ink-850 px-5 py-4">
      <div className="text-[12px] text-lo">{label}</div>
      <div className={`tnum mt-1 text-[20px] font-semibold ${neg ? 'text-red' : pos ? 'text-neon' : ''}`}>{neg && !value.startsWith('−') ? '−' : ''}{value}</div>
      {sub && <div className="mt-1 text-[12px] text-lo">{sub}</div>}
    </div>
  );
}

function Bar({ label, v, max, tone }: { label: string; v: number; max: number; tone: string }) {
  return (
    <div className="grid grid-cols-[96px_1fr_72px] items-center gap-3 py-2 text-[13px]">
      <span className="text-mid">{label}</span>
      <div className="h-1.5 overflow-hidden rounded-full bg-ink-700"><div className={`h-full rounded-full ${tone}`} style={{ width: `${(v / max) * 100}%`, opacity: v ? 1 : 0 }} /></div>
      <span className={`tnum text-right ${v ? '' : 'text-lo'}`}>{v ? money(v) : '—'}</span>
    </div>
  );
}

function Trend({ points }: { points: { date: string; balance: number }[] }) {
  if (points.length < 2) return <div className="px-5 py-10 text-center text-[13px] text-lo">경기를 진행하면 주마다 잔고가 기록됩니다</div>;
  const W = 640, H = 180, P = 8;
  const vs = points.map((p) => p.balance);
  // 잔고 범위에 맞춤 (0부터 그리면 변화가 안 보임), 위아래 15% 여백
  const span = Math.max(Math.max(...vs) - Math.min(...vs), Math.abs(Math.max(...vs)) * 0.02, 1);
  const lo = Math.min(...vs) - span * 0.15, hi = Math.max(...vs) + span * 0.15;
  const x = (i: number) => P + (i / (points.length - 1)) * (W - 2 * P);
  const y = (v: number) => H - P - ((v - lo) / Math.max(1, hi - lo)) * (H - 2 * P);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.balance).toFixed(1)}`).join(' ');
  const last = points.at(-1)!;
  return (
    <div className="px-5 py-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[180px] w-full" preserveAspectRatio="none">
        {lo < 0 && <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} stroke="var(--color-line-strong)" strokeDasharray="4 4" />}
        <path d={`${d} L${x(points.length - 1)} ${H - P} L${P} ${H - P} Z`} fill="var(--color-neon)" opacity=".07" />
        <path d={d} fill="none" stroke="var(--color-neon)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <div className="mt-2 flex justify-between text-[12px] text-lo">
        <span className="tnum">{points[0].date.slice(5).replace('-', '/')} · {money(Math.abs(points[0].balance))}</span>
        <span className="tnum text-mid">{last.date.slice(5).replace('-', '/')} · {last.balance < 0 ? '−' : ''}{money(Math.abs(last.balance))}</span>
      </div>
    </div>
  );
}
