"use client";

/**
 * 結果画面（/result?session=<id>）。
 *
 * ハッカソン提出版でモック準拠の 2 カラムレイアウトに刷新:
 *   - 上部 4 タイル統計（意思決定論点 / 必須 / 推奨 / Past PRD 矛盾）
 *   - 矛盾アラート（「確認する」で Past PRD 由来フィルター）
 *   - フィルタタブ（すべて / 必須 / 推奨 / 未決定のみ）
 *   - 左メイン: アコーディオン化した論点カードリスト + 画面プレビュー
 *   - 右サイドバー: 決定状況 + 優先度内訳 + エクスポート + 新しい PRD
 */

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Card } from "@/components/ui/Card";
import { DEMO_PRDS } from "@/lib/demo-prds";
import {
  copyMarkdownToClipboard,
  downloadMarkdown,
  generateMarkdown,
} from "@/lib/export";
import { loadPrdId, loadResult } from "@/lib/session-storage";
import type { Contradiction, Decision, Priority, Result } from "@/lib/types";
import { MockModalPreview } from "./MockModalPreview";
import { ShiftAutoPreview } from "./ShiftAutoPreview";
import { ReportMonthlyPreview } from "./ReportMonthlyPreview";

function buildPrdLabel(prdId: string | null): string {
  if (!prdId) return "PRD";
  const def = DEMO_PRDS.find((p) => p.id === prdId);
  if (!def) return "PRD";
  return `[${def.category}] ${def.title}`;
}

function handleExportMarkdown(
  result: Result | null,
  decisionStates: Record<number, DecisionState>,
  prdId: string | null,
): void {
  if (!result) return;
  const md = generateMarkdown(result, decisionStates, buildPrdLabel(prdId));
  const filename = `${prdId ?? "prd"}-revised.md`;
  downloadMarkdown(filename, md);
}

async function handleExportNotion(
  result: Result | null,
  decisionStates: Record<number, DecisionState>,
  prdId: string | null,
  setNote: (msg: string | null) => void,
): Promise<void> {
  if (!result) return;
  const md = generateMarkdown(result, decisionStates, buildPrdLabel(prdId));
  const ok = await copyMarkdownToClipboard(md);
  if (ok) {
    setNote("✓ Markdown をクリップボードにコピーしました。Notion に貼り付けてください。");
    setTimeout(() => setNote(null), 5000);
  } else {
    setNote("⚠️ クリップボードコピーに失敗しました。Markdown ボタンをご利用ください。");
    setTimeout(() => setNote(null), 5000);
  }
}

function renderPreview(prdId: string | null): React.ReactNode {
  if (prdId === "user-add") return <MockModalPreview />;
  if (prdId === "shift-auto") return <ShiftAutoPreview />;
  if (prdId === "report-monthly") return <ReportMonthlyPreview />;
  return null;
}

interface DecisionState {
  selectedOption: string | null;
  memo: string;
  decided: boolean;
}

type FilterValue = "all" | "must" | "should" | "undecided";

function decisionsKey(sessionId: string): string {
  return `session:${sessionId}:decisions`;
}

function loadDecisionStates(
  sessionId: string,
): Record<number, DecisionState> | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(decisionsKey(sessionId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<number, DecisionState>;
  } catch {
    return null;
  }
}

function saveDecisionStates(
  sessionId: string,
  states: Record<number, DecisionState>,
): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(decisionsKey(sessionId), JSON.stringify(states));
}

function ResultInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");

  const [result, setResult] = useState<Result | null>(null);
  const [prdId, setPrdId] = useState<string | null>(null);
  const [decisionStates, setDecisionStates] = useState<
    Record<number, DecisionState>
  >({});
  const [filter, setFilter] = useState<FilterValue>("all");
  const [pastPrdOnly, setPastPrdOnly] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [openCardIdx, setOpenCardIdx] = useState<number | null>(0);

  useEffect(() => {
    if (!sessionId) {
      router.replace("/");
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const r = loadResult(sessionId);
      if (!r) {
        router.replace("/");
        return;
      }
      setResult(r);
      setPrdId(loadPrdId(sessionId));
      const saved = loadDecisionStates(sessionId);
      if (saved) {
        setDecisionStates(saved);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId, router]);

  useEffect(() => {
    if (!sessionId || !result) return;
    saveDecisionStates(sessionId, decisionStates);
  }, [sessionId, result, decisionStates]);

  const decidedCount = useMemo(
    () => Object.values(decisionStates).filter((s) => s.decided).length,
    [decisionStates],
  );

  const filteredDecisions = useMemo(() => {
    if (!result) return [];
    return result.decisions
      .map((d, i) => ({ d, i }))
      .filter(({ d, i }) => {
        if (filter === "must" && d.priority !== "must") return false;
        if (filter === "should" && d.priority !== "should") return false;
        if (filter === "undecided" && decisionStates[i]?.decided) return false;
        if (pastPrdOnly && d.source !== "past_prd") return false;
        return true;
      });
  }, [result, filter, pastPrdOnly, decisionStates]);

  if (!result) return null;

  const total = result.decisions.length;
  const mustCount = result.decisions.filter((d) => d.priority === "must").length;
  const shouldCount = result.decisions.filter((d) => d.priority === "should").length;
  const niceCount = result.decisions.filter((d) => d.priority === "nice").length;
  const contradictionsCount = result.contradictions.length;
  const undecidedCount = total - decidedCount;
  const mustUndecided = result.decisions.filter(
    (d, i) => d.priority === "must" && !decisionStates[i]?.decided,
  ).length;
  const decidedByPriority = {
    must: result.decisions.filter(
      (d, i) => d.priority === "must" && decisionStates[i]?.decided,
    ).length,
    should: result.decisions.filter(
      (d, i) => d.priority === "should" && decisionStates[i]?.decided,
    ).length,
    nice: result.decisions.filter(
      (d, i) => d.priority === "nice" && decisionStates[i]?.decided,
    ).length,
  };
  const canExportMust = mustCount === 0 || decidedByPriority.must === mustCount;

  function handleSelectOption(decisionIdx: number, option: string) {
    setDecisionStates((prev) => ({
      ...prev,
      [decisionIdx]: {
        ...(prev[decisionIdx] ?? { selectedOption: null, memo: "", decided: false }),
        selectedOption: option,
      },
    }));
  }

  function handleMemoChange(decisionIdx: number, memo: string) {
    setDecisionStates((prev) => ({
      ...prev,
      [decisionIdx]: {
        ...(prev[decisionIdx] ?? { selectedOption: null, memo: "", decided: false }),
        memo,
      },
    }));
  }

  function handleDecide(decisionIdx: number) {
    setDecisionStates((prev) => {
      const cur = prev[decisionIdx];
      if (!cur?.selectedOption) return prev;
      return { ...prev, [decisionIdx]: { ...cur, decided: true } };
    });
  }

  return (
    <main className="flex-1 w-full max-w-6xl mx-auto px-6 py-10 flex flex-col gap-6">
      {/* ヘッダ */}
      <header className="flex flex-col gap-1.5">
        <h1 className="text-[28px] font-semibold tracking-tight m-0">分析結果</h1>
        <p className="text-sm text-text-muted m-0">
          PRD から <strong className="text-text font-semibold">未決定の意思決定論点</strong>と、
          <strong className="text-text font-semibold">過去 PRD との矛盾</strong>を抽出しました。
        </p>
      </header>

      {/* 4 タイル統計 */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile value={total} label="意思決定論点" accent="default" />
        <StatTile value={mustCount} label="必須" accent="must" />
        <StatTile value={shouldCount} label="推奨" accent="should" />
        <StatTile value={contradictionsCount} label="Past PRD 矛盾" accent="pastprd" />
      </section>

      {/* 矛盾アラート */}
      <ContradictionAlert
        contradictions={result.contradictions}
        pastPrdOnly={pastPrdOnly}
        onTogglePastPrdOnly={() => setPastPrdOnly((v) => !v)}
      />

      <FailedBanner failed={result.meta.failed_agents} />

      {/* フィルタタブ */}
      <div className="flex gap-1.5 flex-wrap -mt-2">
        <FilterTab active={filter === "all"} onClick={() => setFilter("all")} count={total}>
          すべて
        </FilterTab>
        <FilterTab active={filter === "must"} onClick={() => setFilter("must")} count={mustCount}>
          <span className="inline-block w-2 h-2 rounded-full bg-[#D14343] mr-1.5 align-middle" />必須
        </FilterTab>
        <FilterTab active={filter === "should"} onClick={() => setFilter("should")} count={shouldCount}>
          <span className="inline-block w-2 h-2 rounded-full bg-[#D9A441] mr-1.5 align-middle" />推奨
        </FilterTab>
        <FilterTab active={filter === "undecided"} onClick={() => setFilter("undecided")} count={undecidedCount}>
          未決定のみ
        </FilterTab>
      </div>

      {/* 2 カラム: 左メイン + 右サイドバー */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 items-start">
        {/* 左メイン */}
        <div className="flex flex-col gap-2.5 min-w-0">
          {filteredDecisions.length === 0 ? (
            <p className="text-sm text-text-muted py-8 text-center">
              該当する論点はありません。
            </p>
          ) : (
            filteredDecisions.map(({ d, i }) => (
              <DecisionCard
                key={i}
                decision={d}
                state={decisionStates[i] ?? { selectedOption: null, memo: "", decided: false }}
                isOpen={openCardIdx === i}
                onToggle={() => setOpenCardIdx(openCardIdx === i ? null : i)}
                onSelectOption={(opt) => handleSelectOption(i, opt)}
                onMemoChange={(m) => handleMemoChange(i, m)}
                onDecide={() => handleDecide(i)}
              />
            ))
          )}

          {/* 画面プレビュー */}
          {renderPreview(prdId)}
        </div>

        {/* 右サイドバー */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
          <SidebarSection>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-text-muted m-0">決定状況</p>
              <p className="text-xs font-mono tabular-nums text-text-tertiary m-0">
                {decidedCount}/{total}
              </p>
            </div>
            {mustUndecided > 0 ? (
              <p className="text-[13px] text-[#B91C1C] m-0 flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-[#D14343]" aria-hidden="true" />
                必須 <strong>{mustUndecided}</strong> 件 が未決定
              </p>
            ) : (
              <p className="text-[13px] text-success m-0">✓ 必須はすべて決定済み</p>
            )}
          </SidebarSection>

          <SidebarSection>
            <p className="text-xs font-medium text-text-muted m-0 mb-2.5">優先度内訳</p>
            <ul className="flex flex-col gap-1.5 m-0 p-0 list-none text-[13px]">
              <PriorityBreakdownRow color="#D14343" label="必須" decided={decidedByPriority.must} total={mustCount} />
              <PriorityBreakdownRow color="#D9A441" label="推奨" decided={decidedByPriority.should} total={shouldCount} />
              <PriorityBreakdownRow color="#888780" label="任意" decided={decidedByPriority.nice} total={niceCount} />
            </ul>
          </SidebarSection>

          <SidebarSection>
            <p className="text-xs font-medium text-text-muted m-0 mb-2.5">エクスポート</p>
            <p className="text-[11px] text-text-tertiary m-0 mb-2.5 leading-relaxed">
              {canExportMust
                ? "決定内容を Markdown でダウンロード or Notion に貼り付けできます。"
                : `必須論点を ${mustCount} 件決定するとエクスポートできます`}
            </p>
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                disabled={!canExportMust}
                onClick={() => handleExportMarkdown(result, decisionStates, prdId)}
                className="text-xs px-3 py-1.5 bg-card border-[0.5px] border-border-strong rounded-md disabled:opacity-40 hover:bg-bg-secondary inline-flex items-center gap-1.5 justify-center"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Markdown ダウンロード
              </button>
              <button
                type="button"
                disabled={!canExportMust}
                onClick={() => handleExportNotion(result, decisionStates, prdId, setExportNote)}
                className="text-xs px-3 py-1.5 bg-card border-[0.5px] border-border-strong rounded-md disabled:opacity-40 hover:bg-bg-secondary inline-flex items-center gap-1.5 justify-center"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                Notion 用コピー
              </button>
              {exportNote && (
                <p className="text-[11px] text-success m-0 mt-1">{exportNote}</p>
              )}
            </div>
          </SidebarSection>

          <button
            type="button"
            onClick={() => router.push("/")}
            className="text-xs text-text-tertiary hover:text-text-muted hover:bg-bg-secondary inline-flex items-center gap-1 mt-1 px-2 py-1 -mx-2 rounded-md transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
            新しい PRD を分析
          </button>
        </aside>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// 統計タイル（上部 4 個）
// ---------------------------------------------------------------------------

function StatTile({
  value,
  label,
  accent,
}: {
  value: number;
  label: string;
  accent: "default" | "must" | "should" | "pastprd";
}) {
  const borderColor = {
    default: "#E5E1D8",
    must: "#D14343",
    should: "#D9A441",
    pastprd: "#F59E0B",
  }[accent];
  const valueColor = {
    default: "var(--color-text)",
    must: "#B91C1C",
    should: "#92400E",
    pastprd: "#92400E",
  }[accent];
  return (
    <div
      className="bg-card border-[0.5px] border-border rounded-lg px-4 py-3.5 border-l-[4px]"
      style={{ borderLeftColor: borderColor }}
    >
      <p className="text-[28px] font-semibold tabular-nums m-0 leading-none" style={{ color: valueColor }}>
        {value}
      </p>
      <p className="text-xs text-text-muted m-0 mt-1.5">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 矛盾アラート
// ---------------------------------------------------------------------------

function ContradictionAlert({
  contradictions,
  pastPrdOnly,
  onTogglePastPrdOnly,
}: {
  contradictions: Contradiction[];
  pastPrdOnly: boolean;
  onTogglePastPrdOnly: () => void;
}) {
  if (contradictions.length === 0) return null;

  return (
    <div className="bg-bg-warning border-l-[3px] border-warning px-4 py-3 rounded-r-md flex items-center gap-3">
      <svg className="text-warning flex-shrink-0" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <p className="flex-1 text-[13px] text-text m-0">
        過去 PRD との矛盾が <strong>{contradictions.length}</strong> 件見つかりました。先に確認することをおすすめします。
      </p>
      <button
        type="button"
        onClick={onTogglePastPrdOnly}
        aria-pressed={pastPrdOnly}
        className={[
          "text-xs px-3 py-1.5 border-[0.5px] rounded-md flex-shrink-0 transition",
          pastPrdOnly
            ? "bg-warning/20 border-warning text-warning font-medium"
            : "bg-card border-border-strong hover:bg-bg-secondary",
        ].join(" ")}
      >
        {pastPrdOnly ? "解除" : "確認する"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// フィルタタブ
// ---------------------------------------------------------------------------

function FilterTab({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "text-xs px-3 py-1.5 rounded-md border-[0.5px] transition inline-flex items-center",
        active
          ? "bg-text text-card border-text"
          : "bg-card border-border-strong text-text hover:bg-bg-secondary",
      ].join(" ")}
    >
      {children}
      {count !== undefined && (
        <span className={["ml-2 tabular-nums", active ? "opacity-70" : "text-text-tertiary"].join(" ")}>
          {count}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// 右サイドバーセクション
// ---------------------------------------------------------------------------

function SidebarSection({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-card border-[0.5px] border-border rounded-lg px-4 py-3.5">
      {children}
    </div>
  );
}

function PriorityBreakdownRow({
  color,
  label,
  decided,
  total,
}: {
  color: string;
  label: string;
  decided: number;
  total: number;
}) {
  return (
    <li className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-text-muted">
        <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
        {label}
      </span>
      <span className="font-mono tabular-nums">
        <strong className="text-text">{decided}</strong>
        <span className="text-text-tertiary">/{total}</span>
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// 論点カード（アコーディオン）
// ---------------------------------------------------------------------------

function isPastPrd(d: Decision): boolean {
  return d.source === "past_prd";
}

function DecisionCard({
  decision,
  state,
  isOpen,
  onToggle,
  onSelectOption,
  onMemoChange,
  onDecide,
}: {
  decision: Decision;
  state: DecisionState;
  isOpen: boolean;
  onToggle: () => void;
  onSelectOption: (opt: string) => void;
  onMemoChange: (memo: string) => void;
  onDecide: () => void;
}) {
  const { selectedOption, memo, decided } = state;
  const canDecide = selectedOption !== null && !decided;
  const fromPastPrd = isPastPrd(decision);

  return (
    <div
      className={[
        "border-[0.5px] border-border rounded-lg bg-card transition",
        fromPastPrd ? "border-l-[5px] border-l-[#F59E0B]" : "",
        decision.priority === "must" && !fromPastPrd ? "border-l-[5px] border-l-[#D14343]" : "",
        decided ? "bg-bg-secondary/50" : "",
      ].join(" ")}
    >
      {/* ヘッダ（クリックで展開） */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-center gap-3"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
          <PriorityBadgeNew priority={decision.priority} />
          <span
            className="text-[11px] px-2 py-0.5 rounded-md"
            style={{
              backgroundColor: (CATEGORY_COLOR[decision.category] ?? CATEGORY_COLOR.other).bg,
              color: (CATEGORY_COLOR[decision.category] ?? CATEGORY_COLOR.other).fg,
            }}
          >
            {categoryLabel(decision.category)}
          </span>
          {fromPastPrd && (
            <span
              className="text-[11px] px-2 py-0.5 rounded-md font-medium inline-flex items-center gap-1"
              style={{ backgroundColor: "#FEF3C7", color: "#8B5A00" }}
            >
              ⚠ Past PRD
            </span>
          )}
          <p className="text-[14px] font-medium m-0 ml-1 truncate">{decision.title}</p>
        </div>
        <span className={["text-[11px] tabular-nums shrink-0", decided ? "text-success font-medium" : "text-text-tertiary"].join(" ")}>
          {decided ? "✓ 決定済み" : "未決定"}
        </span>
        <svg
          className={["text-text-tertiary transition-transform shrink-0", isOpen ? "rotate-180" : ""].join(" ")}
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
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* 展開部分 */}
      {isOpen && (
        <div className="px-4 pb-4 pt-1 flex flex-col gap-3 border-t-[0.5px] border-border">
          <p className="text-[13px] text-text-muted m-0 leading-relaxed mt-2">
            {decision.rationale}
          </p>

          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] font-medium text-text-muted m-0">選択肢</p>
            {decision.options.map((opt) => (
              <label
                key={opt}
                className={[
                  "flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-md border-[0.5px] cursor-pointer transition",
                  selectedOption === opt
                    ? "bg-bg-info/30 border-text-info"
                    : "bg-card border-border hover:bg-bg-secondary",
                  decided ? "cursor-default" : "",
                ].join(" ")}
              >
                <input
                  type="radio"
                  name={`opt-${decision.title}`}
                  checked={selectedOption === opt}
                  onChange={() => !decided && onSelectOption(opt)}
                  disabled={decided}
                  className="accent-text-info"
                />
                {opt}
              </label>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] font-medium text-text-muted m-0">メモ (任意)</p>
            <textarea
              value={memo}
              onChange={(e) => onMemoChange(e.target.value)}
              placeholder="判断の根拠や補足を記入..."
              aria-label="メモ"
              disabled={decided}
              rows={2}
              className="w-full text-[13px] font-sans px-3 py-2 bg-card border-[0.5px] border-border rounded-md focus:outline-none focus:border-text-info disabled:bg-bg-secondary resize-y"
            />
          </div>

          <button
            type="button"
            onClick={onDecide}
            disabled={!canDecide}
            className={[
              "text-[13px] px-3.5 py-2 rounded-md border-[0.5px] inline-flex items-center justify-center gap-1.5 transition self-start",
              canDecide
                ? "bg-text text-card border-text hover:opacity-90"
                : "bg-card border-border text-text-tertiary opacity-50 cursor-not-allowed",
            ].join(" ")}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {decided ? "決定済み" : "この内容で決定する"}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 優先度バッジ
// ---------------------------------------------------------------------------

function PriorityBadgeNew({ priority }: { priority: Priority }) {
  if (priority === "must") {
    return (
      <span className="text-[11px] px-2 py-0.5 rounded-md font-medium bg-badge-required-bg text-badge-required-text">
        必須
      </span>
    );
  }
  if (priority === "should") {
    return (
      <span className="text-[11px] px-2 py-0.5 rounded-md font-medium bg-badge-recommended-bg text-badge-recommended-text">
        推奨
      </span>
    );
  }
  return (
    <span className="text-[11px] px-2 py-0.5 rounded-md font-medium bg-bg-secondary text-text-muted">
      任意
    </span>
  );
}

function categoryLabel(category: string): string {
  const map: Record<string, string> = {
    validation: "バリデーション",
    empty_state: "空状態",
    loading: "ローディング",
    error: "エラー",
    edge_case: "異常系",
    domain: "ドメイン",
    other: "その他",
  };
  return map[category] ?? category;
}

const CATEGORY_COLOR: Record<string, { bg: string; fg: string }> = {
  validation: { bg: "#DBEAFE", fg: "#1E40AF" },
  empty_state: { bg: "#F3E8FF", fg: "#6B21A8" },
  loading: { bg: "#CFFAFE", fg: "#155E75" },
  domain: { bg: "#DCFCE7", fg: "#166534" },
  error: { bg: "#FED7AA", fg: "#92400E" },
  edge_case: { bg: "#FFEDD5", fg: "#9A3412" },
  other: { bg: "#F1F5F9", fg: "#475569" },
};

// ---------------------------------------------------------------------------
// FailedBanner（縮退動作中）
// ---------------------------------------------------------------------------

function FailedBanner({ failed }: { failed: string[] }) {
  if (failed.length === 0) return null;
  return (
    <Card className="border-warning/40 bg-warning/10">
      <div className="text-sm font-medium text-warning">
        ⚠️ 縮退動作中（一部の Agent が失敗）
      </div>
      <ul className="mt-1 text-xs text-text-muted font-mono">
        {failed.map((f) => (
          <li key={f}>- {f}</li>
        ))}
      </ul>
    </Card>
  );
}

export default function ResultPage() {
  return (
    <Suspense fallback={null}>
      <ResultInner />
    </Suspense>
  );
}
