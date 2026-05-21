"use client";

/**
 * 月次レポート自動配信機能の画面プレビュー（KintaiKit / PRD c 用）。
 *
 * 「自動配信されるレポートのイメージ」をメール風 + KPI カードで見せる。
 * user-add と違い状態切替なし、静的ビュー。
 */

import { Card } from "@/components/ui/Card";

const KPIS = [
  { label: "総勤務時間", value: "8,420", unit: "h" },
  { label: "残業時間", value: "312", unit: "h" },
  { label: "欠勤・遅刻", value: "12", unit: "件" },
];

const RANKING = [
  { dept: "営業 1 課", hours: 1820 },
  { dept: "開発部", hours: 1654 },
  { dept: "経理部", hours: 1402 },
];

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

        {/* KPI 3 つ */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {KPIS.map((k) => (
            <div
              key={k.label}
              className="bg-bg-secondary rounded-md px-3 py-2.5"
            >
              <div className="text-[11px] text-text-muted">{k.label}</div>
              <div className="text-lg font-medium tabular-nums">
                {k.value}
                <span className="text-xs text-text-muted ml-0.5">{k.unit}</span>
              </div>
            </div>
          ))}
        </div>

        {/* 部署別ランキング */}
        <div className="mb-3">
          <div className="text-xs font-medium text-text-muted mb-1.5">
            部署別 勤務時間 Top 3
          </div>
          <div className="flex flex-col gap-1">
            {RANKING.map((r, i) => (
              <div
                key={r.dept}
                className="flex items-center gap-2 text-xs"
              >
                <span className="w-4 text-text-tertiary tabular-nums">
                  {i + 1}.
                </span>
                <span className="flex-1">{r.dept}</span>
                <span className="tabular-nums text-text-muted">
                  {r.hours.toLocaleString()} h
                </span>
              </div>
            ))}
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
