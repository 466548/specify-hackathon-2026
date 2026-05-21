"use client";

/**
 * 入力画面（/）。
 *
 * Week 6 デザイン磨き (5/18) でドロップダウン + プレビュー領域形式に変更。
 * 自由入力廃止の方針はそのまま（DEMO_PRDS 3 件から選ぶ）。
 *
 * モック: Downloads/01_specify_select.html を参考に、
 *   - ヘッダ: "PRD レビュー Agent" + Specify バッジ
 *   - Step 1 カード: select で PRD を選び、下の preview 領域に概要 / サイズ /
 *     推定時間 / 想定論点数を展開
 *   - 「分析を開始」ボタンで /analyzing へ
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DEMO_PRDS, type DemoPrd } from "@/lib/demo-prds";
import {
  SessionStorageQuotaError,
  savePrd,
  savePrdId,
} from "@/lib/session-storage";

/** PRD ごとの「サイズ / 推定時間 / 想定論点数」表示用メタ。モックの数値を参考に。 */
const PRD_META: Record<string, { size: string; eta: string; issues: string }> = {
  "user-add": {
    size: "2.4 KB / 約 420 字",
    eta: "推定 30 秒",
    issues: "10〜15 件",
  },
  "shift-auto": {
    size: "3.1 KB / 約 580 字",
    eta: "推定 35 秒",
    issues: "12〜18 件",
  },
  "report-monthly": {
    size: "1.8 KB / 約 320 字",
    eta: "推定 25 秒",
    issues: "8〜12 件",
  },
};

export default function Home() {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string>(DEMO_PRDS[0].id);
  const [error, setError] = useState<string | null>(null);

  const selected: DemoPrd = useMemo(
    () =>
      DEMO_PRDS.find((p) => p.id === selectedId) ?? DEMO_PRDS[0],
    [selectedId],
  );
  const meta = PRD_META[selected.id];

  function handleAnalyze() {
    let sessionId: string;
    try {
      sessionId = crypto.randomUUID();
    } catch {
      sessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    try {
      savePrd(sessionId, selected.prdText);
      savePrdId(sessionId, selected.id);
    } catch (e) {
      if (e instanceof SessionStorageQuotaError) {
        setError(e.message);
        return;
      }
      throw e;
    }
    router.push(`/analyzing?session=${sessionId}`);
  }

  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-6 py-8 flex flex-col gap-6">
      {/* ヘッダ: PRDレビュー Agent + Specify バッジ */}
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-[22px] font-medium tracking-tight m-0">
            PRD レビュー Agent
          </h1>
          <span className="text-xs px-2.5 py-[3px] rounded-md bg-bg-info text-text-info">
            Specify
          </span>
        </div>
        <p className="text-sm text-text-muted m-0">
          PRD の「決まっていない意思決定」を 3 つの専門 Agent が並列で洗い出し、その場で決定できます。
        </p>
      </header>

      {/* Step 1: PRD Selector */}
      <Card className="border-0.5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-[22px] h-[22px] rounded-full bg-bg-info text-text-info flex items-center justify-center text-xs font-medium">
            1
          </div>
          <span className="text-sm font-medium">分析する PRD を選ぶ</span>
        </div>

        <div className="flex gap-2 items-center mb-3">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            aria-label="分析する PRD を選択"
            className="flex-1 h-9 px-3 text-sm bg-card border-[0.5px] border-border-strong rounded-md cursor-pointer hover:border-text-muted"
          >
            {DEMO_PRDS.map((prd) => (
              <option key={prd.id} value={prd.id}>
                [{prd.category}] {prd.title}
              </option>
            ))}
          </select>
          <Button onClick={handleAnalyze}>
            分析を開始
            <svg
              className="ml-1.5 inline-block"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Button>
        </div>

        {/* PRD Preview */}
        <div className="bg-bg-secondary rounded-md px-4 py-3.5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-card border-[0.5px] border-border text-text-muted">
              {selected.category}
            </span>
            <span className="text-sm font-medium">{selected.title}</span>
          </div>
          <p className="text-[13px] text-text-muted m-0 mb-2.5 leading-relaxed">
            {selected.description}
          </p>
          <div className="flex gap-4 text-xs text-text-tertiary flex-wrap">
            <MetaItem
              icon={
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              }
            >
              {meta.size}
            </MetaItem>
            <MetaItem
              icon={
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              }
            >
              {meta.eta}
            </MetaItem>
            <MetaItem
              icon={
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="6" />
                  <circle cx="12" cy="12" r="2" />
                </svg>
              }
              title="Specify が抽出する未決定の意思決定論点の想定件数です"
            >
              想定論点 {meta.issues}
            </MetaItem>
          </div>
        </div>
      </Card>

      {error && (
        <div
          role="alert"
          className="text-sm text-error border border-error/30 bg-error/10 rounded-md px-3 py-2"
        >
          {error}
        </div>
      )}

      {/* セキュリティ表記: enterprise 審査員向けの信頼性アピール。 */}
      <p className="text-xs text-text-tertiary flex items-center gap-1.5 m-0">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="4" y="11" width="16" height="10" rx="2" ry="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
        分析データはセッション内でのみ保持され、外部に保存されません
      </p>
    </main>
  );
}

function MetaItem({
  icon,
  children,
  title,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1"
      title={title}
    >
      {icon}
      <span>{children}</span>
    </span>
  );
}
