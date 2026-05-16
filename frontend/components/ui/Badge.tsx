/**
 * Badge: priority と category の 2 系統。
 *
 * priority は色つき（赤/黄/緑、CLAUDE.md の絵文字記号と整合）。
 * category は中性色のラベル（categories は 7 種類あるので個別色は付けず統一感優先）。
 */

import type { Category, Priority } from "@/lib/types";

const PRIORITY_LABEL: Record<Priority, string> = {
  must: "🔴 必須",
  should: "🟡 推奨",
  nice: "🟢 任意",
};

const PRIORITY_CLASS: Record<Priority, string> = {
  must: "bg-error/10 text-error border-error/30",
  should: "bg-warning/10 text-warning border-warning/30",
  nice: "bg-success/10 text-success border-success/30",
};

const CATEGORY_LABEL: Record<Category, string> = {
  validation: "バリデーション",
  empty_state: "空状態",
  loading: "ローディング",
  error: "エラー",
  edge_case: "異常系",
  domain: "ドメイン",
  other: "その他",
};

interface PriorityBadgeProps {
  priority: Priority;
}

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center px-2 py-0.5 rounded-sm",
        "text-xs font-medium border",
        PRIORITY_CLASS[priority],
      ].join(" ")}
    >
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

interface CategoryBadgeProps {
  category: Category;
}

export function CategoryBadge({ category }: CategoryBadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center px-2 py-0.5 rounded-sm",
        "text-xs font-medium border border-border bg-bg text-text-muted",
      ].join(" ")}
    >
      {CATEGORY_LABEL[category] ?? category}
    </span>
  );
}
