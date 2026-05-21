"use client";

/**
 * シフト自動割当機能の画面プレビュー（KintaiKit / PRD b 用）。
 *
 * user-add の MockModalPreview と違い、状態切替はなく単一の静的ビュー。
 * 「自動割当の結果カレンダー」のイメージを 5 名 × 7 日のグリッドで見せる。
 *
 * デモ意図:
 *   - シフト系 PRD でも /result の最下部に「対応する画面イメージ」が出る一貫性
 *   - ただし作り込みは user-add 側にフォーカスしているため、こちらは概念図止まり
 */

import { Card } from "@/components/ui/Card";

// 表示用の固定シフトデータ。デモ用に意味のある分布になるよう手動で並べる。
type Slot = "AM" | "PM" | "FULL" | "OFF";

const STAFF: { name: string; role: string }[] = [
  { name: "佐藤", role: "正社員" },
  { name: "鈴木", role: "正社員" },
  { name: "高橋", role: "契約" },
  { name: "田中", role: "アルバイト" },
  { name: "渡辺", role: "アルバイト" },
];

const DAYS = ["月", "火", "水", "木", "金", "土", "日"];

// 5 行 × 7 列。各セル = Slot。
const SCHEDULE: Slot[][] = [
  ["FULL", "FULL", "OFF", "FULL", "FULL", "AM", "OFF"],
  ["FULL", "OFF", "FULL", "FULL", "FULL", "PM", "OFF"],
  ["AM", "AM", "PM", "OFF", "PM", "FULL", "AM"],
  ["OFF", "PM", "AM", "PM", "OFF", "FULL", "PM"],
  ["PM", "FULL", "FULL", "AM", "AM", "OFF", "FULL"],
];

const SLOT_STYLE: Record<Slot, string> = {
  FULL: "bg-success/15 text-success",
  AM: "bg-bg-info text-text-info",
  PM: "bg-accent/15 text-accent",
  OFF: "bg-bg-secondary text-text-tertiary",
};

const SLOT_LABEL: Record<Slot, string> = {
  FULL: "終日",
  AM: "AM",
  PM: "PM",
  OFF: "休",
};

export function ShiftAutoPreview() {
  return (
    <section className="flex flex-col gap-3 mt-2">
      <h2 className="text-lg font-semibold">画面プレビュー</h2>

      <Card className="border-warning/30 bg-warning/5">
        <p className="text-xs text-text m-0">
          💡 これは「シフト自動割当」決定結果の画面プレビューです。各論点の決定内容に応じて表示が変わります。
        </p>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-medium m-0">来週のシフト割当結果</p>
            <p className="text-[11px] text-text-muted m-0">2026/05/20 週・店舗 A</p>
          </div>
          <button
            type="button"
            disabled
            className="text-xs px-3 py-1.5 bg-primary text-primary-fg rounded-md opacity-60"
          >
            適用する
          </button>
        </div>

        {/* シフト表 */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                <th className="text-left text-text-tertiary font-normal py-1 px-2 w-20">
                  スタッフ
                </th>
                {DAYS.map((d, i) => (
                  <th
                    key={d}
                    className={[
                      "text-center font-normal py-1 px-1 text-text-tertiary",
                      i >= 5 ? "text-text-danger/70" : "",
                    ].join(" ")}
                  >
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {STAFF.map((s, rowIdx) => (
                <tr key={s.name} className="border-t border-border">
                  <td className="py-1.5 px-2">
                    <div className="text-text font-medium">{s.name}</div>
                    <div className="text-[10px] text-text-tertiary">
                      {s.role}
                    </div>
                  </td>
                  {SCHEDULE[rowIdx].map((slot, colIdx) => (
                    <td key={colIdx} className="py-1 px-1">
                      <div
                        className={[
                          "text-center rounded-sm py-1 text-[11px] font-medium",
                          SLOT_STYLE[slot],
                        ].join(" ")}
                      >
                        {SLOT_LABEL[slot]}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 凡例 */}
        <div className="flex gap-3 mt-3 text-[11px] text-text-muted flex-wrap">
          <LegendItem className={SLOT_STYLE.FULL}>終日</LegendItem>
          <LegendItem className={SLOT_STYLE.AM}>AM のみ</LegendItem>
          <LegendItem className={SLOT_STYLE.PM}>PM のみ</LegendItem>
          <LegendItem className={SLOT_STYLE.OFF}>休</LegendItem>
        </div>
      </Card>
    </section>
  );
}

function LegendItem({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={["inline-block w-3 h-3 rounded-sm", className].join(" ")}
        aria-hidden="true"
      />
      {children}
    </span>
  );
}
