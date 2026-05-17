/**
 * /analyzing でエラー発生時に表示するバナー。
 *
 * バックエンドの classify_exception (backend/src/specify_backend/errors.py) が
 * 返す error_type に応じて、見出し / 説明文 / アイコンを切り替える。
 * retryable=true なら「再試行」「最初に戻る」、false なら「最初に戻る」のみ。
 *
 * デザイン: 凝りすぎない。デモ動画にも出さない (答え.md の方針)。実運用想定の
 * 堅牢性アピールとして「ちゃんと種類別に出ている」ことが伝われば十分。
 */

import type { ErrorType } from "@/lib/types";

import { Button } from "./Button";
import { Card } from "./Card";

interface ErrorBannerProps {
  errorType: ErrorType;
  message: string;
  retryable: boolean;
  /** 「再試行」ボタンの onClick。retryable=true 時のみ表示。 */
  onRetry?: () => void;
  /** 「最初に戻る」ボタンの onClick。常に表示。 */
  onReset: () => void;
}

interface ErrorMeta {
  /** バナー先頭の絵文字。視認性のため。 */
  icon: string;
  /** 短い見出し（1 行）。 */
  title: string;
  /** 補助文。次に何をすべきか。 */
  hint: string;
}

const ERROR_META: Record<ErrorType, ErrorMeta> = {
  rate_limit: {
    icon: "⏱️",
    title: "API がレート制限中です",
    hint: "短時間に多くのリクエストが集中したようです。少し待ってから再試行してください。",
  },
  timeout: {
    icon: "🌐",
    title: "通信がタイムアウトしました",
    hint: "ネットワークが不安定な可能性があります。再試行で復旧することが多いです。",
  },
  unknown: {
    icon: "⚠️",
    title: "想定外のエラーが発生しました",
    hint: "詳細を確認の上、再試行してみてください。続く場合は管理者へ連絡を。",
  },
  auth: {
    icon: "🔒",
    title: "API キーが無効です",
    hint: "サーバー側の設定を確認してください。再試行しても同じ結果になります。",
  },
  credit_exhausted: {
    icon: "💳",
    title: "API の利用枠を超えています",
    hint: "請求設定や利用枠を確認してください。再試行しても同じ結果になります。",
  },
};

export function ErrorBanner({
  errorType,
  message,
  retryable,
  onRetry,
  onReset,
}: ErrorBannerProps) {
  const meta = ERROR_META[errorType];
  return (
    <Card className="flex flex-col gap-3 border-error/40 bg-error/5">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <span aria-hidden="true">{meta.icon}</span>
          {meta.title}
        </h2>
        <p className="text-sm text-text-muted">{meta.hint}</p>
      </div>

      {/* バックエンドからの生メッセージは debug 性で見せる（折りたたみ等は省略）。 */}
      <div className="text-xs text-text-muted font-mono break-all border border-border rounded px-2 py-1 bg-bg">
        {message}
      </div>

      <div className="flex gap-2 justify-end">
        {retryable && onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            再試行
          </Button>
        )}
        <Button onClick={onReset}>最初に戻る</Button>
      </div>
    </Card>
  );
}
