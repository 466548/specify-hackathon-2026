"use client";

/**
 * 月次レポート自動配信機能の画面プレビュー（KintaiKit / PRD c 用）。
 *
 * 「自動配信されるレポートのイメージ」をメール風 + KPI カード + ランキングで見せる。
 * KPI には前月比（MoM）のミニ表示、ランキングには横棒グラフを添えて、
 * 「単なる数字の羅列」ではなく実プロダクトに近い表現に磨いている。
 */

import { Card } from "@/components/ui/Card";

type KPI = {
  label: string;
  value: string;
  unit: string;
  delta: number; // % vs 前月
};

const KPIS: KPI[] = [
  { label: "総勤務時間", value: "8,420", unit: "h", delta: 2.1 },
  { label: "残業時間", value: "312", unit: "h", delta: -8.4 },
  { label: "欠勤・遅刻", value: "12", unit: "件", delta: 9.1 },
];

// delta の符号と「数値が増えると良い/悪い」の方向で色を決める。
// 総勤務時間は増えると良い（+）、残業・欠勤は減ると良い（-）。
const KPI_BETTER_WHEN: ("up" | "down")[] = ["up", "down", "down"];

const RANKING = [
  { dept: "営業 1 課", hours: 1820 },
  { dept: "開発部", hours: 1654 },
  { dept: "経理部", hours: 1402 },
];

const MAX_HOURS = Math.max(...RANKING.map((r) => r.hours));

export function ReportMonthlyPreview() {
  return (
    <section className="flex flex-col gap-3 mt-2">
      <h2 className="text-lg font-semibold">画面プレビュー</h2>

      <Card className="border-warning/30 bg-warning/5">
        <p className="text-xs text-text m-0">
          💡 これは「月次レポート」決定結果の画面プレビューです。各論点の決定内容に応じて表示が変わります。
        </p>
      </Card>

      <Card>
        {/* メールヘッダ風 */}
        <div className="border-b border-border pb-2.5 mb-3">
          <div className="text-[11px] text-text-tertiary">
            From: notice@kintaikit.example.com
          </div>
          <div className="text-[11px] text-text-tertiary">
            To: <span className="text-text-muted">経営層配信リスト</span>（5 名）
          </div>
          <div className="text-sm font-medium mt-1">
            📊 月次勤怠レポート - 2026 年 4 月
          </div>
        </div>

        {/* KPI 3 つ + 前月比 */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {KPIS.map((k, i) => (
            <KpiCard key={k.label} kpi={k} betterWhen={KPI_BETTER_WHEN[i]} />
          ))}
        </div>

        {/* 部署別ランキング + 横棒グラフ */}
        <div className="mb-3">
          <div className="text-xs font-medium text-text-muted mb-1.5">
            部署別 勤務時間 Top 3
          </div>
          <div className="flex flex-col gap-1.5">
            {RANKING.map((r, i) => {
              const pct = Math.round((r.hours / MAX_HOURS) * 100);
              return (
                <div key={r.dept} className="flex items-center gap-2 text-xs">
                  <span className="w-4 text-text-tertiary tabular-nums">
                    {i + 1}.
                  </span>
                  <span className="w-20 truncate">{r.dept}</span>
                  <div className="flex-1 h-2 bg-bg-secondary rounded-sm overflow-hidden">
                    <div
                      className="h-full bg-primary/70 rounded-sm transition-[width]"
                      style={{ width: `${pct}%` }}
                      aria-hidden="true"
                    />
                  </div>
                  <span className="tabular-nums text-text-muted w-14 text-right">
                    {r.hours.toLocaleString()} h
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* フッタ */}
        <div className="border-t border-border pt-2.5 text-[11px] text-text-tertiary leading-relaxed">
          このメールは KintaiKit から自動配信されています。
          <br />
          配信タイミング: 毎月 1 日 09:00 (JST) / 配信先の変更は管理画面から。
        </div>
      </Card>
    </section>
  );
}

function KpiCard({
  kpi,
  betterWhen,
}: {
  kpi: KPI;
  betterWhen: "up" | "down";
}) {
  const isUp = kpi.delta > 0;
  const isGood = (isUp && betterWhen === "up") || (!isUp && betterWhen === "down");
  const colorClass = isGood ? "text-success" : "text-error";
  const arrow = isUp ? "▲" : "▼";
  const absDelta = Math.abs(kpi.delta).toFixed(1);

  return (
    <div className="bg-bg-secondary rounded-md px-3 py-2.5">
      <div className="text-[11px] text-text-muted">{kpi.label}</div>
      <div className="text-lg font-medium tabular-nums">
        {kpi.value}
        <span className="text-xs text-text-muted ml-0.5">{kpi.unit}</span>
      </div>
      <div
        className={`text-[10px] tabular-nums mt-0.5 ${colorClass}`}
        title={`前月比 ${isUp ? "+" : "-"}${absDelta}%`}
      >
        {arrow} {absDelta}%
        <span className="text-text-tertiary ml-1">vs 前月</span>
      </div>
    </div>
  );
}
