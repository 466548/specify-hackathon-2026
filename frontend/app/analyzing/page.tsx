"use client";

/**
 * 分析中画面（/analyzing?session=<id>）。
 *
 * ハッカソン提出版でモック準拠の大型レイアウトに刷新:
 *   - ヘッダ: 「分析中」+ 経過時間（mono）+ PRD カテゴリバッジ + タイトル + 中止
 *   - Agent ワークフロー: 大型 SVG。Planner / 3 並列 / Reviewer を縦余裕で配置
 *   - 3 レーン: 「論点抽出 / エッジケース検出 / 過去 PRD 参照」のセクション見出し
 *   - 実行ログ: タイムスタンプ + [event_name] + 説明 で整形
 *
 * SSE 受信ロジック（CRLF 正規化 + Strict Mode useRef ガード）は Week 5 から変更なし。
 */

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { loadPrd, loadPrdId, saveResult } from "@/lib/session-storage";
import { DEMO_PRDS } from "@/lib/demo-prds";
import { openAnalyzeStream, type StructuredError } from "@/lib/sse-client";
import type { ProgressEvent, Result } from "@/lib/types";

type AgentState = "idle" | "running" | "completed";

/** 各 Agent の表示用メタ。executor_id とフロント表示名のマッピング。 */
interface AgentDef {
  id: string;
  shortName: string; // dot / lane で使う短い名前
  fullName: string; // SVG で使うフル名
  sectionName?: string; // 3 レーンのセクション見出し
}

const PLANNER: AgentDef = {
  id: "PlannerAgent",
  shortName: "Planner",
  fullName: "Planner",
};
const PARALLEL_AGENTS: AgentDef[] = [
  { id: "DecisionAgent", shortName: "Decision", fullName: "Decision Agent", sectionName: "論点抽出" },
  { id: "EdgeCaseAgent", shortName: "EdgeCase", fullName: "EdgeCase Agent", sectionName: "エッジケース検出" },
  { id: "PastPRDAgent", shortName: "Past PRD", fullName: "Past PRD Agent", sectionName: "過去 PRD 参照" },
];
const REVIEWER: AgentDef = {
  id: "reviewer_aggregator",
  shortName: "Reviewer",
  fullName: "Reviewer",
};

/** "[管理者操作] ユーザー追加..." 形式の prdLabel を category と title に分解する。 */
function splitPrdLabel(label: string): { category: string; title: string } {
  const m = label.match(/^\[([^\]]+)\]\s*(.+)$/);
  if (m) return { category: m[1], title: m[2] };
  return { category: "", title: label };
}

/** 各 SSE event を「Agent 名: 説明」形式に整える（実行ログ表示用）。 */
function eventDescription(ev: ProgressEvent): string {
  switch (ev.type) {
    case "planner_started":
      return "Planner Agent: 分析計画を作成中";
    case "planner_completed":
      return ev.message || "Planner 完了";
    case "notion_fetch_started":
      return "Notion: 過去 PRD を取得中";
    case "notion_fetch_completed":
      return ev.message || "Notion: 取得完了";
    case "workflow_started":
      return "並列実行を開始";
    case "executor_invoked":
    case "executor_completed":
      return `${(ev as { executor_id?: string }).executor_id ?? "?"}: ${ev.type}`;
    default:
      return ev.message || ev.type;
  }
}

function AnalyzingInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");

  const [agentStates, setAgentStates] = useState<Record<string, AgentState>>({
    PlannerAgent: "idle",
    DecisionAgent: "idle",
    EdgeCaseAgent: "idle",
    PastPRDAgent: "idle",
    reviewer_aggregator: "idle",
  });
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [error, setError] = useState<StructuredError | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [prdLabel, setPrdLabel] = useState<string>("");

  const sseStartedRef = useRef(false);
  const abortFnRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(timer);
  }, [retryKey]);

  useEffect(() => {
    if (sseStartedRef.current) return;
    if (!sessionId) {
      router.replace("/");
      return;
    }
    const prd = loadPrd(sessionId);
    if (!prd) {
      router.replace("/");
      return;
    }
    const pid = loadPrdId(sessionId);
    const def = DEMO_PRDS.find((p) => p.id === pid);
    if (def) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPrdLabel(`[${def.category}] ${def.title}`);
    }

    sseStartedRef.current = true;
    abortFnRef.current = openAnalyzeStream(prd, {
      onProgress: (ev) => {
        setEvents((prev) => [...prev, ev]);
        if (ev.type === "planner_started") {
          setAgentStates((s) => ({ ...s, PlannerAgent: "running" }));
        } else if (ev.type === "planner_completed") {
          setAgentStates((s) => ({ ...s, PlannerAgent: "completed" }));
        }
      },
      onExecutorInvoked: (id) => {
        if (id === "dispatcher") return;
        setAgentStates((s) => ({ ...s, [id]: "running" }));
      },
      onExecutorCompleted: (id) => {
        if (id === "dispatcher") return;
        setAgentStates((s) => ({ ...s, [id]: "completed" }));
      },
      onOutput: (result: Result) => {
        saveResult(sessionId, result);
        router.push(`/result?session=${sessionId}`);
      },
      onError: (err) => {
        setError(err);
      },
    });
  }, [sessionId, router, retryKey]);

  function handleCancel() {
    abortFnRef.current?.();
    abortFnRef.current = null;
    router.push("/");
  }

  if (error) {
    const handleRetry = () => {
      abortFnRef.current?.();
      abortFnRef.current = null;
      sseStartedRef.current = false;
      setError(null);
      setEvents([]);
      setElapsed(0);
      setAgentStates({
        PlannerAgent: "idle",
        DecisionAgent: "idle",
        EdgeCaseAgent: "idle",
        PastPRDAgent: "idle",
        reviewer_aggregator: "idle",
      });
      setRetryKey((k) => k + 1);
    };
    return (
      <main className="flex-1 w-full max-w-5xl mx-auto px-6 py-10 flex flex-col gap-4">
        <h1 className="text-[22px] font-medium tracking-tight">エラー</h1>
        <ErrorBanner
          errorType={error.errorType}
          message={error.message}
          retryable={error.retryable}
          onRetry={error.retryable ? handleRetry : undefined}
          onReset={() => router.push("/")}
        />
      </main>
    );
  }

  const labelParts = splitPrdLabel(prdLabel || "PRD");

  return (
    <main className="flex-1 w-full max-w-5xl mx-auto px-6 py-10 flex flex-col gap-5">
      {/* ヘッダ */}
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <h1 className="text-[28px] font-semibold tracking-tight m-0">分析中</h1>
            <span className="text-sm text-text-muted font-mono tabular-nums bg-bg-secondary px-2 py-0.5 rounded">
              {formatElapsed(elapsed)}
            </span>
          </div>
          <p className="text-sm text-text-muted m-0 flex items-center gap-2 flex-wrap">
            {labelParts.category && (
              <span className="text-[11px] px-2 py-0.5 rounded bg-bg-secondary text-text border border-border">
                {labelParts.category}
              </span>
            )}
            <span>{labelParts.title} を分析しています</span>
          </p>
        </div>
        <button
          type="button"
          onClick={handleCancel}
          className="text-sm px-3.5 py-2 bg-card border-[0.5px] border-border-strong rounded-md hover:bg-bg-secondary inline-flex items-center gap-1.5"
          aria-label="分析を中止"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          中止
        </button>
      </header>

      {/* Agent ワークフロー */}
      <section className="bg-card border-[0.5px] border-border rounded-lg px-6 py-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-medium text-text m-0">Agent ワークフロー</p>
          <p className="text-xs text-text-tertiary m-0">並列実行 · 3 agents</p>
        </div>
        <PipelineSvg agentStates={agentStates} />
      </section>

      {/* 3 レーン */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {PARALLEL_AGENTS.map((agent) => (
          <AgentLane key={agent.id} agent={agent} state={agentStates[agent.id]} />
        ))}
      </div>

      {/* 実行ログ */}
      <details className="bg-card border-[0.5px] border-border rounded-lg px-5 py-3.5 mt-1">
        <summary className="text-sm font-medium cursor-pointer select-none flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5">
            <svg className="specify-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="9 6 15 12 9 18" />
            </svg>
            実行ログを表示
          </span>
          <span className="text-xs text-text-tertiary">{events.length} 件</span>
        </summary>
        <div className="mt-3 font-mono text-[12px] leading-relaxed text-text-muted max-h-56 overflow-y-auto flex flex-col gap-0.5">
          {events.map((ev, i) => (
            <div key={i} className="flex gap-2.5">
              <span className="text-text-tertiary shrink-0">{formatElapsed(Math.floor(i * 0.3))}</span>
              <span className="text-text-info shrink-0">[{ev.type}]</span>
              <span className="text-text-muted">{eventDescription(ev)}</span>
            </div>
          ))}
        </div>
      </details>
    </main>
  );
}

// ---------------------------------------------------------------------------
// SVG パイプライン（大型レイアウト）
// ---------------------------------------------------------------------------

function PipelineSvg({
  agentStates,
}: {
  agentStates: Record<string, AgentState>;
}) {
  const planner = styleFor(agentStates.PlannerAgent);
  const decision = styleFor(agentStates.DecisionAgent);
  const edgeCase = styleFor(agentStates.EdgeCaseAgent);
  const pastPrd = styleFor(agentStates.PastPRDAgent);
  const reviewer = styleFor(agentStates.reviewer_aggregator);

  const connColorIn = (parallelState: AgentState) =>
    agentStates.PlannerAgent === "completed" ||
    parallelState === "running" ||
    parallelState === "completed"
      ? "#1D9E75"
      : "#888780";
  const connColorOut = (parallelState: AgentState) =>
    parallelState === "completed" ? "#1D9E75" : "#888780";
  const connStyle = (color: string, agentState?: AgentState) => ({
    stroke: color,
    strokeWidth: 2,
    fill: "none",
    strokeDasharray:
      agentState === undefined || agentState === "completed" ? undefined : "4,4",
    className: agentState === "running" ? "specify-dash-flow" : undefined,
  });

  // 大型レイアウト定数
  const BOX_H = 64;
  const GAP = 16;
  const TOP = 10;
  const Y_TOP = TOP;
  const Y_MID = TOP + BOX_H + GAP;
  const Y_BOT = TOP + (BOX_H + GAP) * 2;
  const C_TOP = Y_TOP + BOX_H / 2;
  const C_MID = Y_MID + BOX_H / 2;
  const C_BOT = Y_BOT + BOX_H / 2;
  const VB_H = Y_BOT + BOX_H + TOP;

  // 横方向の座標
  const PLANNER_X = 30;
  const PLANNER_W = 120;
  const PARALLEL_X = 300;
  const PARALLEL_W = 240;
  const REVIEWER_X = 680;
  const REVIEWER_W = 150;
  const VB_W = REVIEWER_X + REVIEWER_W + 30;

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-auto block"
      role="img"
      aria-label="パイプライン: Planner から並列3 Agent を経て Reviewer へ"
    >
      {/* Planner → parallel コネクタ */}
      <path
        d={`M ${PLANNER_X + PLANNER_W} ${C_MID} L ${PARALLEL_X} ${C_TOP}`}
        {...connStyle(connColorIn(agentStates.DecisionAgent), agentStates.DecisionAgent)}
      />
      <path
        d={`M ${PLANNER_X + PLANNER_W} ${C_MID} L ${PARALLEL_X} ${C_MID}`}
        {...connStyle(connColorIn(agentStates.EdgeCaseAgent), agentStates.EdgeCaseAgent)}
      />
      <path
        d={`M ${PLANNER_X + PLANNER_W} ${C_MID} L ${PARALLEL_X} ${C_BOT}`}
        {...connStyle(connColorIn(agentStates.PastPRDAgent), agentStates.PastPRDAgent)}
      />

      {/* parallel → Reviewer コネクタ */}
      <path
        d={`M ${PARALLEL_X + PARALLEL_W} ${C_TOP} L ${REVIEWER_X} ${C_MID}`}
        {...connStyle(connColorOut(agentStates.DecisionAgent), agentStates.DecisionAgent)}
      />
      <path
        d={`M ${PARALLEL_X + PARALLEL_W} ${C_MID} L ${REVIEWER_X} ${C_MID}`}
        {...connStyle(connColorOut(agentStates.EdgeCaseAgent), agentStates.EdgeCaseAgent)}
      />
      <path
        d={`M ${PARALLEL_X + PARALLEL_W} ${C_BOT} L ${REVIEWER_X} ${C_MID}`}
        {...connStyle(connColorOut(agentStates.PastPRDAgent), agentStates.PastPRDAgent)}
      />

      <PipelineBox x={PLANNER_X} y={Y_MID} w={PLANNER_W} h={BOX_H} centered style={planner} name={PLANNER.fullName} />
      <PipelineBox x={PARALLEL_X} y={Y_TOP} w={PARALLEL_W} h={BOX_H} style={decision} name="Decision Agent" />
      <PipelineBox x={PARALLEL_X} y={Y_MID} w={PARALLEL_W} h={BOX_H} style={edgeCase} name="EdgeCase Agent" />
      <PipelineBox x={PARALLEL_X} y={Y_BOT} w={PARALLEL_W} h={BOX_H} style={pastPrd} name="Past PRD Agent" />
      <PipelineBox x={REVIEWER_X} y={Y_MID} w={REVIEWER_W} h={BOX_H} centered style={reviewer} name={REVIEWER.fullName} />
    </svg>
  );
}

function PipelineBox({
  x,
  y,
  w,
  h,
  centered,
  style,
  name,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  centered?: boolean;
  style: ReturnType<typeof styleFor>;
  name: string;
}) {
  const textX = centered ? x + w / 2 : x + 16;
  const anchor = centered ? "middle" : "start";
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={8}
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth={1}
      />
      <text
        x={textX}
        y={y + 26}
        textAnchor={anchor}
        style={{ fontSize: "15px", fontWeight: 600, fill: style.textFill }}
      >
        {name}
      </text>
      <text
        x={textX}
        y={y + 46}
        textAnchor={anchor}
        style={{ fontSize: "13px", fill: style.subFill }}
      >
        {style.label}
      </text>
    </g>
  );
}

function styleFor(s: AgentState) {
  if (s === "completed")
    return {
      fill: "#E1F5EE",
      stroke: "#1D9E75",
      textFill: "#04342C",
      subFill: "#0F6E56",
      label: "✓ 完了",
    };
  if (s === "running")
    return {
      fill: "#EEEDFE",
      stroke: "#534AB7",
      textFill: "#26215C",
      subFill: "#534AB7",
      label: "実行中...",
    };
  return {
    fill: "#F1EFE8",
    stroke: "#888780",
    textFill: "#2C2C2A",
    subFill: "#5F5E5A",
    label: "待機中",
  };
}

// ---------------------------------------------------------------------------
// レーン詳細（大型）
// ---------------------------------------------------------------------------

function AgentLane({ agent, state }: { agent: AgentDef; state: AgentState }) {
  const progressPct = state === "completed" ? 100 : state === "running" ? 50 : 0;
  const dotClass =
    state === "running"
      ? "bg-running specify-pulse"
      : state === "completed"
        ? "bg-done"
        : "bg-pending";
  const barClass =
    state === "completed"
      ? "bg-done"
      : state === "running"
        ? "bg-running"
        : "bg-pending";
  const statusLabel =
    state === "completed" ? "完了" : state === "running" ? "実行中" : "待機";
  const statusClass =
    state === "completed"
      ? "text-success"
      : state === "running"
        ? "text-running"
        : "text-text-tertiary";

  return (
    <div className="bg-card border-[0.5px] border-border rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`inline-block w-2 h-2 rounded-full ${dotClass}`} aria-hidden="true" />
          <span className="text-xs text-text-muted">{agent.sectionName}</span>
        </div>
        <span className={`text-xs tabular-nums ${statusClass}`}>{statusLabel}</span>
      </div>
      <p className="text-[15px] font-semibold m-0">{agent.shortName}</p>
      <div className="h-1 bg-bg-secondary rounded-full overflow-hidden">
        <div className={`h-full transition-all duration-500 ${barClass}`} style={{ width: `${progressPct}%` }} />
      </div>
      <div className="text-[12px] text-text-muted min-h-[18px]">
        {state === "idle" && <span className="text-text-tertiary">待機中</span>}
        {state === "running" && (
          <span className="text-text-tertiary inline-flex items-center gap-1">
            <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            分析中…
          </span>
        )}
        {state === "completed" && (
          <span className="text-success inline-flex items-center gap-1">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            完了
          </span>
        )}
      </div>
    </div>
  );
}

function formatElapsed(secs: number): string {
  const m = String(Math.floor(secs / 60)).padStart(2, "0");
  const s = String(secs % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export default function AnalyzingPage() {
  return (
    <Suspense fallback={null}>
      <AnalyzingInner />
    </Suspense>
  );
}
