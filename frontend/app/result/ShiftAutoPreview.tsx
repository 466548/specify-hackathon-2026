"use client";

/**
 * シフト自動割当機能の画面プレビュー（KintaiKit / PRD b 用）。
 *
 * 状態切替パネルから 3 つの方針（バランス / 希望重視 / 売上重視）を選び、
 * 同じ 5 名 × 7 日のグリッドで割当結果がどう変わるかを見せる。
 *
 * 状態は MockModalPreview と同じく useState で管理し、`?preview-states=0`
 * で切替パネルを非表示にできる（既定 ON）。decisions と連動するのは将来の拡張。
 */

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { Card } from "@/components/ui/Card";

type Slot = "AM" | "PM" | "FULL" | "OFF";
type Variant = "balanced" | "staffFirst" | "revenueFirst";

const STAFF: { name: string; role: string }[] = [
  { name: "佐藤", role: "正社員" },
  { name: "鈴木", role: "正社員" },
  { name: "高橋", role: "契約" },
  { name: "田中", role: "アルバイト" },
  { name: "渡辺", role: "アルバイト" },
];

const DAYS = ["月", "火", "水", "木", "金", "土", "日"];

// 5 行 × 7 列 × 3 バリアント。各セル = Slot。
const SCHEDULES: Record<Variant, Slot[][]> = {
  balanced: [
    ["FULL", "FULL", "OFF", "FULL", "FULL", "AM", "OFF"],
    ["FULL", "OFF", "FULL", "FULL", "FULL", "PM", "OFF"],
    ["AM", "AM", "PM", "OFF", "PM", "FULL", "AM"],
    ["OFF", "PM", "AM", "PM", "OFF", "FULL", "PM"],
    ["PM", "FULL", "FULL", "AM", "AM", "OFF", "FULL"],
  ],
  staffFirst: [
    ["FULL", "OFF", "OFF", "FULL", "FULL", "OFF", "OFF"],
    ["OFF", "FULL", "FULL", "OFF", "FULL", "OFF", "OFF"],
    ["AM", "AM", "OFF", "OFF", "PM", "AM", "OFF"],
    ["OFF", "PM", "OFF", "PM", "OFF", "PM", "OFF"],
    ["PM", "OFF", "FULL", "AM", "OFF", "OFF", "AM"],
  ],
  revenueFirst: [
    ["FULL", "FULL", "FULL", "FULL", "FULL", "FULL", "FULL"],
    ["FULL", "FULL", "FULL", "FULL", "FULL", "FULL", "OFF"],
    ["FULL", "AM", "FULL", "FULL", "FULL", "FULL", "FULL"],
    ["PM", "FULL", "FULL", "FULL", "FULL", "FULL", "FULL"],
    ["FULL", "FULL", "FULL", "FULL", "FULL", "FULL", "FULL"],
  ],
};

const VARIANT_OPTIONS: { value: Variant; label: string; sub: string }[] = [
  { value: "balanced", label: "バランス", sub: "公平性と稼働の中間" },
  { value: "staffFirst", label: "希望重視", sub: "週休 2 日を優先" },
  { value: "revenueFirst", label: "売上重視", sub: "ピーク時間に厚く" },
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
  const searchParams = useSearchParams();
  const showStatesPanel = searchParams.get("preview-states") !== "0";

  const [variant, setVariant] = useState<Variant>("balanced");
  const schedule = SCHEDULES[variant];

  return (
    <section className="flex flex-col gap-3 mt-2">
      <h2 className="text-lg font-semibold">画面プレビュー</h2>

      <Card className="border-warning/30 bg-warning/5">
        <p className="text-xs text-text m-0">
          💡 これは「シフト自動割当」決定結果の画面プレビューです。各論点の決定内容に応じて表示が変わります。
        </p>
      </Card>

      {showStatesPanel && (
        <Card className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-medium text-text-muted">割当方針:</span>
          {VARIANT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setVariant(opt.value)}
              title={opt.sub}
              className={[
                "text-xs px-2 py-1 rounded-sm border transition-colors",
                variant === opt.value
                  ? "bg-primary text-primary-fg border-primary"
                  : "bg-card text-text border-border hover:bg-bg-secondary",
              ].join(" ")}
            >
              {opt.label}
            </button>
          ))}
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-medium m-0">来週のシフト割当結果</p>
            <p className="text-[11px] text-text-muted m-0">
              2026/05/20 週・店舗 A・
              {VARIANT_OPTIONS.find((o) => o.value === variant)?.label}方針
            </p>
          </div>
          <button
            type="button"
            disabled
            title="プレビューのためクリック不可"
            className="text-xs px-3 py-1.5 bg-primary text-primary-fg rounded-md opacity-60 hover:opacity-80 cursor-not-allowed transition-opacity"
          >
            適用する
          </button>
        </div>

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
                <tr
                  key={s.name}
                  className="border-t border-border hover:bg-bg-secondary/50 transition-colors"
                >
                  <td className="py-1.5 px-2">
                    <div className="text-text font-medium">{s.name}</div>
                    <div className="text-[10px] text-text-tertiary">
                      {s.role}
                    </div>
                  </td>
                  {schedule[rowIdx].map((slot, colIdx) => (
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
