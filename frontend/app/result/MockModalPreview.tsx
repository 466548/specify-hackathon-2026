"use client";

/**
 * 軽量画面プレビュー（KintaiKit ユーザー追加モーダル特化）。
 *
 * Specify は本来「PRD から意思決定論点を出す」ツールだが、論点が「画面の状態」に
 * 関わる場合に *どんな画面になるのか* を即座にイメージできるよう、サンプル PRD
 * （demo-data/sample-prd.md = ユーザー追加モーダル）に特化したモック UI を併設する。
 *
 * Week 5 では:
 *   - JSX はハードコード（PRD ごとの動的生成は将来の拡張）
 *   - 5 状態（Default / Empty / Loading / Error / LongText）を切替パネルで操作
 *   - ヘッダーで「これはサンプル PRD 専用モック」と明示（誤解防止）
 *   - 切替パネルは URL パラメータ `?preview-states=0` のときのみ非表示（既定 ON）
 *   - dev/本番でも常に動く（process.env.NODE_ENV gate は使わない）
 *
 * Week 6 以降で decisions から動的に状態を導出する形に拡張する想定。
 */

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";

type PreviewState = "default" | "empty" | "loading" | "error" | "longtext";

const STATE_OPTIONS: { value: PreviewState; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "empty", label: "Empty（空状態）" },
  { value: "loading", label: "Loading（読込中）" },
  { value: "error", label: "Error（エラー）" },
  { value: "longtext", label: "LongText（長文）" },
];

const LONG_NAME =
  "山田なんとかかんとか太郎・ジョナサン・フィッツジェラルド・ザ・サード";

// Week 6 で `decisions: Decision[]` を props に追加し、動的に状態を導出する想定。
// Week 5 ではモック専用なので props なしで構築する。
export function MockModalPreview() {
  const searchParams = useSearchParams();
  // URL に ?preview-states=0 がある時のみパネル非表示。それ以外（無し含む）は表示。
  const showStatesPanel = searchParams.get("preview-states") !== "0";

  const [state, setState] = useState<PreviewState>("default");

  return (
    <section className="flex flex-col gap-3 mt-2">
      <h2 className="text-lg font-semibold">画面プレビュー</h2>

      {/* 誤解防止ヘッダー。常時表示（タズさん指示）。 */}
      <Card className="border-warning/30 bg-warning/5">
        <p className="text-xs text-text">
          💡 これは「ユーザー追加モーダル」決定結果の画面プレビューです。各論点の決定内容に応じて表示が変わります。
        </p>
      </Card>

      {/* 状態切替パネル */}
      {showStatesPanel && (
        <Card className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-medium text-text-muted">状態:</span>
          {STATE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setState(opt.value)}
              className={[
                "text-xs px-2 py-1 rounded-sm border",
                state === opt.value
                  ? "bg-primary text-primary-fg border-primary"
                  : "bg-card text-text border-border hover:bg-bg",
              ].join(" ")}
            >
              {opt.label}
            </button>
          ))}
        </Card>
      )}

      {/* モック本体 */}
      <Card className="bg-bg">
        <div className="flex justify-center py-6">
          <Modal state={state} />
        </div>
      </Card>
    </section>
  );
}

// ---------------------------------------------------------------------------
// モーダル本体（5 状態を切替）
// ---------------------------------------------------------------------------

function Modal({ state }: { state: PreviewState }) {
  const isLoading = state === "loading";
  const isError = state === "error";
  const isEmpty = state === "empty";
  const isLong = state === "longtext";

  // フィールド値（Default / LongText / Empty で値を差し替え）
  const nameValue = isEmpty ? "" : isLong ? LONG_NAME : "山田 太郎";
  const emailValue = isEmpty ? "" : "yamada@example.com";
  const dept = isEmpty ? "" : "営業部";

  return (
    <div className="w-full max-w-lg bg-card border border-border rounded-lg shadow-md">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold">メンバーを追加</h3>
        <button
          type="button"
          className="text-text-muted hover:text-text text-sm"
          aria-label="閉じる"
        >
          ×
        </button>
      </div>

      {/* ボディ */}
      <div className="px-4 py-4 flex flex-col gap-3 text-sm">
        {isError && (
          <div
            role="alert"
            className="text-xs text-error bg-error/10 border border-error/30 rounded-sm px-2 py-1.5"
          >
            メールアドレスが既に登録されています
          </div>
        )}

        <Field label="氏名" required>
          <input
            readOnly
            value={nameValue}
            placeholder={isEmpty ? "" : undefined}
            className={[
              "w-full px-2 py-1.5 border rounded-sm bg-card text-sm",
              isLong ? "truncate" : "",
              isError ? "border-error" : "border-border",
            ].join(" ")}
          />
          {isLong && (
            <p className="text-[10px] text-text-muted mt-1">
              ⚠️ 30 文字超の表示方法は未定義
            </p>
          )}
        </Field>

        <Field label="メールアドレス" required>
          <input
            readOnly
            value={emailValue}
            placeholder={isEmpty ? "" : undefined}
            className={[
              "w-full px-2 py-1.5 border rounded-sm bg-card text-sm",
              isError ? "border-error" : "border-border",
            ].join(" ")}
          />
        </Field>

        <Field label="部署" required>
          <select
            disabled
            value={dept}
            className="w-full px-2 py-1.5 border border-border rounded-sm bg-card text-sm"
          >
            <option value="">選択してください</option>
            <option value="営業部">営業部</option>
            <option value="開発部">開発部</option>
          </select>
        </Field>

        <Field label="雇用形態" required>
          <div className="flex gap-3 text-xs">
            {["正社員", "契約社員", "アルバイト"].map((v) => (
              <label key={v} className="flex items-center gap-1">
                <input
                  type="radio"
                  name="employment"
                  disabled
                  checked={!isEmpty && v === "正社員"}
                  readOnly
                />
                {v}
              </label>
            ))}
          </div>
        </Field>

        <Field label="入社日" required>
          <input
            type="text"
            readOnly
            value={isEmpty ? "" : "2026-06-01"}
            placeholder="YYYY-MM-DD"
            className="w-full px-2 py-1.5 border border-border rounded-sm bg-card text-sm"
          />
        </Field>
      </div>

      {/* フッター */}
      <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
        <button
          type="button"
          disabled={isLoading}
          className="text-xs px-3 py-1.5 rounded-sm border border-border bg-card hover:bg-bg disabled:opacity-50"
        >
          キャンセル
        </button>
        <button
          type="button"
          disabled={isLoading || isEmpty}
          className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-sm bg-primary text-primary-fg disabled:opacity-50"
        >
          {isLoading && <Spinner size={12} />}
          {isLoading ? "保存中..." : "保存"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-text">
        {label}
        {required && <span className="text-error ml-0.5">*</span>}
      </span>
      {children}
    </div>
  );
}
