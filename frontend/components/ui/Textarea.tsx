"use client";

/**
 * Textarea + ラベル + 文字数カウンタ。
 *
 * 入力画面（/）で PRD を貼り付けてもらうために使う。
 * value / onChange は呼び出し側で useState 管理（Controlled）。
 */

import type { TextareaHTMLAttributes } from "react";

interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> {
  label: string;
  value: string;
  onChange: (next: string) => void;
  /** 文字数カウンタを表示するか（既定 true）。 */
  showCounter?: boolean;
}

export function Textarea({
  label,
  value,
  onChange,
  showCounter = true,
  id,
  className = "",
  ...rest
}: TextareaProps) {
  // id 指定がなければラベルとの関連付け用に自動生成。
  const inputId = id ?? `textarea-${label.replace(/\s+/g, "-")}`;
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={inputId}
        className="text-sm font-medium text-text"
      >
        {label}
      </label>
      <textarea
        id={inputId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={[
          "w-full min-h-60 px-3 py-2",
          "bg-card border border-border rounded-md",
          "text-sm leading-6 text-text",
          "focus:outline-none focus:ring-2 focus:ring-primary",
          className,
        ].join(" ")}
        {...rest}
      />
      {showCounter && (
        <div className="text-xs text-text-muted text-right">
          {value.length.toLocaleString()} 文字
        </div>
      )}
    </div>
  );
}
