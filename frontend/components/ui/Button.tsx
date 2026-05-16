"use client";

/**
 * 自作 Button コンポーネント。
 *
 * Week 5 では shadcn 等を入れず、Tailwind v4 のユーティリティだけで実装する
 * （CLAUDE.md「不要なライブラリ追加禁止」と整合）。
 *
 * variant:
 *   - primary    塗りつぶし（主アクション）
 *   - secondary  枠線のみ（副アクション）
 *   - ghost      装飾なし（リンク代替やキャンセル用）
 *
 * loading=true の時は disabled になり、左に小さな spinner を出す。
 */

import { Spinner } from "./Spinner";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  children: ReactNode;
}

// variant 別の Tailwind クラス。@theme で定義したトークン（primary / border 等）を参照。
const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-fg hover:opacity-90 disabled:opacity-50",
  secondary:
    "border border-border bg-card text-text hover:bg-bg disabled:opacity-50",
  ghost:
    "bg-transparent text-text hover:bg-bg disabled:opacity-50",
};

export function Button({
  variant = "primary",
  loading = false,
  disabled,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      type="button"
      disabled={isDisabled}
      className={[
        "inline-flex items-center justify-center gap-2",
        "px-4 py-2 rounded-md text-sm font-medium",
        "transition-opacity transition-colors",
        "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
        "disabled:cursor-not-allowed",
        VARIANT_CLASSES[variant],
        className,
      ].join(" ")}
      {...rest}
    >
      {loading && <Spinner size={16} />}
      {children}
    </button>
  );
}
