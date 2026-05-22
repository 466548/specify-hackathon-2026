"use client";

/**
 * 入力画面（/）。
 *
 * ハッカソン提出版でモック準拠の 2 カラムレイアウトに刷新:
 *   - 左: 見出し + デモ PRD 横並び + 編集可能 textarea + 分析開始ボタン
 *   - 右: ANALYSIS PIPELINE カード（01〜04 のステップ概要）
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { DEMO_PRDS, type DemoPrd } from "@/lib/demo-prds";
import {
  SessionStorageQuotaError,
  savePrd,
  savePrdId,
} from "@/lib/session-storage";

/** PRD ごとの token 数（モック準拠、UI 表示用の固定値）。 */
const PRD_TOKENS: Record<string, number> = {
  "user-add": 1247,
  "shift-auto": 983,
  "report-monthly": 712,
};

/** ANALYSIS PIPELINE の 4 ステップ説明（右カラム用）。 */
const PIPELINE_STEPS: { num: string; title: string; desc: string }[] = [
  { num: "01", title: "PRD を入力", desc: "テキスト貼り付けまたはデモ PRD" },
  { num: "02", title: "Agent が並列分析", desc: "Planner → 3 Agents → Reviewer" },
  { num: "03", title: "論点を確認・決定", desc: "優先度順に選択肢を選ぶ" },
  { num: "04", title: "Markdown でエクスポート", desc: "Notion / ドキュメントへ反映" },
];

export default function Home() {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string>(DEMO_PRDS[0].id);
  const [error, setError] = useState<string | null>(null);

  const selected: DemoPrd = useMemo(
    () => DEMO_PRDS.find((p) => p.id === selectedId) ?? DEMO_PRDS[0],
    [selectedId],
  );

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
    <main className="flex-1 w-full max-w-5xl mx-auto px-6 py-10 flex flex-col gap-8">
      {/* 上段: 2 カラム（左 = 見出し / 右 = ANALYSIS PIPELINE） */}
      <section className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-8 items-start">
        <div className="flex flex-col gap-3">
          <h1 className="text-[34px] leading-tight font-semibold tracking-tight m-0">
            PRD の「決まっていないこと」を、
            <br />
            Agent が洗い出す。
          </h1>
          <p className="text-sm text-text-muted m-0 leading-relaxed max-w-lg">
            Specify は、仕様書レビュー前に未決定の論点・エッジケース・過去 PRD との矛盾を抽出するマルチエージェント分析ツールです。
          </p>
        </div>

        <aside className="bg-card border-[0.5px] border-border rounded-lg px-5 py-4 w-full lg:w-[340px] shadow-sm">
          <p className="text-[11px] font-medium tracking-[0.18em] text-text-tertiary m-0 mb-3">
            ANALYSIS PIPELINE
          </p>
          <ol className="flex flex-col gap-3 m-0 p-0 list-none">
            {PIPELINE_STEPS.map((s) => (
              <li key={s.num} className="flex items-start gap-3">
                <span className="text-[11px] font-mono tabular-nums text-text bg-[#dbe3e3] px-1.5 py-0.5 rounded mt-0.5">
                  {s.num}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[13px] font-medium leading-snug">
                    {s.title}
                  </span>
                  <span className="text-xs text-text-muted leading-snug">
                    {s.desc}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </aside>
      </section>

      {/* デモ PRD 横並びカード */}
      <section className="flex flex-col gap-3">
        <p className="text-xs font-medium text-text-muted m-0">デモ PRD から選択</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {DEMO_PRDS.map((prd) => {
            const active = prd.id === selectedId;
            return (
              <button
                key={prd.id}
                type="button"
                onClick={() => setSelectedId(prd.id)}
                className={[
                  "text-left bg-card border rounded-lg px-4 py-3.5 transition relative",
                  active
                    ? "border-success border-[2.5px] bg-success/5"
                    : "border-border border-[0.5px] hover:border-border-strong",
                ].join(" ")}
              >
                {active && (
                  <span className="absolute top-3 right-3 text-success" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                )}
                <p className="text-[13px] font-medium m-0 mb-1.5 pr-5">{prd.title}</p>
                <p className="text-xs text-text-muted m-0 mb-2.5 leading-relaxed">
                  {prd.description}
                </p>
                <p className="text-[11px] font-mono tabular-nums text-text-tertiary m-0">
                  {PRD_TOKENS[prd.id]?.toLocaleString() ?? "-"} tokens
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* PRD プレビュー（読み取り専用） */}
      <section className="flex flex-col gap-2">
        <p className="text-xs font-medium text-text-muted m-0">PRD プレビュー</p>
        <textarea
          value={selected.prdText}
          readOnly
          aria-label="PRD 本文（読み取り専用）"
          rows={10}
          className="w-full text-[13px] font-mono leading-relaxed px-4 py-3 bg-bg-secondary border-[0.5px] border-border rounded-lg resize-y focus:outline-none cursor-default"
        />
        <p className="text-[11px] text-text-tertiary m-0">
          上のカードから選んだ PRD の内容です。分析データはこのセッション内でのみ保持されます。
        </p>
      </section>

      {error && (
        <div role="alert" className="text-sm text-error border border-error/30 bg-error/10 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      {/* 分析開始 */}
      <section className="flex items-center gap-4">
        <Button onClick={handleAnalyze}>
          分析を開始する
          <svg className="ml-1.5 inline-block" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </Button>
        <span className="text-xs text-text-tertiary">約 10〜20 秒で完了します</span>
      </section>
    </main>
  );
}
