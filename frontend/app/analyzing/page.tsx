"use client";

/**
 * 分析中画面（/analyzing?session=<id>）。
 *
 * Week 6 デザイン磨き (5/18) でモック (Downloads/02_specify_analyzing.html) に合わせて
 * 大幅にレイアウト変更:
 *   - SVG パイプライン可視化（Planner → 並列3 → Reviewer、状態色分け）
 *   - 3 レーン詳細（dot + 進捗バー + 状態テキスト）
 *   - 経過時間カウンタ + 中止ボタン
 *   - 開発者向けログを <details> で折りたたみ
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
}

const PLANNER: AgentDef = {
  id: "PlannerAgent",
  shortName: "Planner",
  fullName: "Planner",
};
const PARALLEL_AGENTS: AgentDef[] = [
  { id: "DecisionAgent", shortName: "Decision", fullName: "Decision Agent" },
  { id: "EdgeCaseAgent", shortName: "EdgeCase", fullName: "EdgeCase Agent" },
  { id: "PastPRDAgent", shortName: "Past PRD", fullName: "Past PRD Agent" },
];
const REVIEWER: AgentDef = {
  id: "reviewer_aggregator",
  shortName: "Reviewer",
  fullName: "Reviewer",
};

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

  // 経過時間カウンタ。retryKey が変わったら 0 から再開する。
  useEffect(() => {
    setElapsed(0);
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
    // 表示用に PRD 名を解決（[カテゴリ] タイトル の形）。
    const pid = loadPrdId(sessionId);
    const def = DEMO_PRDS.find((p) => p.id === pid);
    if (def) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPrdLabel(`[${def.category}] ${def.title}`);
    }

    sseStartedRef.current = true;
    openAnalyzeStream(prd, {
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

  if (error) {
    const handleRetry = () => {
      sseStartedRef.current = false;
      setError(null);
      setEvents([]);
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
      <main className="flex-1 w-full max-w-2xl mx-auto px-6 py-8 flex flex-col gap-4">
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

  return (
    <main className="flex-1 w-full max-w-2xl mx-auto px-6 py-8 flex flex-col gap-4">
      {/* ヘッダ: 分析中 + 経過時間 + 中止ボタン */}
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-[22px] font-medium tracking-tight m-0">分析中</h1>
            <span className="text-xs text-text-muted font-mono tabular-nums">
              {formatElapsed(elapsed)}
            </span>
          </div>
          <p className="text-[13px] text-text-muted m-0">
            {prdLabel || "PRD"} を分析しています
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="text-xs px-3 py-1.5 bg-card border-[0.5px] border-border-strong rounded-md hover:bg-bg-secondary inline-flex items-center gap-1"
          aria-label="分析を中止"
        >
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
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          中止
        </button>
      </header>

      {/* パイプライン SVG */}
      <div className="bg-card border-[0.5px] border-border rounded-lg px-4 py-5 pb-3">
        <PipelineSvg agentStates={agentStates} />
      </div>

      {/* 3 レーン */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {PARALLEL_AGENTS.map((agent) => (
          <AgentLane
            key={agent.id}
            agent={agent}
            state={agentStates[agent.id]}
          />
        ))}
      </div>

      {/* 開発者ログ折りたたみ */}
      <details className="bg-bg-secondary rounded-md px-3.5 py-2.5 mt-2">
        <summary className="text-xs text-text-muted cursor-pointer select-none flex items-center gap-1">
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
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
          実行ログを表示{" "}
          <span className="text-text-tertiary">(開発者向け)</span>{" "}
          <span className="text-text-tertiary">· {events.length} 件</span>
        </summary>
        <div className="mt-2.5 font-mono text-[11px] leading-relaxed text-text-muted max-h-40 overflow-y-auto">
          {events.map((ev, i) => (
            <div key={i}>
              <span className="text-text-tertiary">
                {formatElapsed(Math.floor(i * 0.3))}{" "}
              </span>
              [{ev.type}] {ev.message}
            </div>
          ))}
        </div>
      </details>
    </main>
  );
}

// ---------------------------------------------------------------------------
// SVG パイプライン
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

  // コネクタの色: planner と parallel で繋ぐ線は planner が done なら teal、それ以外は gray dashed
  const connColorIn = (parallelState: AgentState) =>
    agentStates.PlannerAgent === "completed" ||
    parallelState === "running" ||
    parallelState === "completed"
      ? "#1D9E75"
      : "#888780";
  // parallel と reviewer のコネクタ: parallel が完了したものは teal、それ以外は gray dashed
  const connColorOut = (parallelState: AgentState) =>
    parallelState === "completed" ? "#1D9E75" : "#888780";
  const connStyle = (color: string, agentState?: AgentState) => ({
    stroke: color,
    strokeWidth: 1.5,
    fill: "none",
    strokeDasharray:
      agentState === undefined || agentState === "completed" ? undefined : "3,3",
  });

  // レイアウト定数:
  //   - 各並列ボックス高さ 40、間に 8px のギャップを入れて重なり / 接触感を解消
  //   - 並列の中央列 (EdgeCase) の縦中心 = 64 を基準に Planner / Reviewer を縦中央寄せ
  //   - viewBox 高は 128（並列 3 つ + 上下マージン）
  const BOX_H = 40;
  const GAP = 8;
  const TOP = 4; // 上下に少しだけ余白
  const Y_TOP = TOP; // 4
  const Y_MID = TOP + BOX_H + GAP; // 52
  const Y_BOT = TOP + (BOX_H + GAP) * 2; // 100
  const C_TOP = Y_TOP + BOX_H / 2; // 24
  const C_MID = Y_MID + BOX_H / 2; // 72
  const C_BOT = Y_BOT + BOX_H / 2; // 120
  const VB_H = Y_BOT + BOX_H + TOP; // 144

  return (
    <svg
      viewBox={`0 0 640 ${VB_H}`}
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-auto block"
      role="img"
      aria-label="パイプライン: Planner から並列3 Agent を経て Reviewer へ"
    >
      {/* Planner → parallel コネクタ（Planner の右端中央 (90, C_MID) から各並列の左端中央へ） */}
      <path
        d={`M 90 ${C_MID} L 200 ${C_TOP}`}
        {...connStyle(connColorIn(agentStates.DecisionAgent), agentStates.DecisionAgent)}
      />
      <path
        d={`M 90 ${C_MID} L 200 ${C_MID}`}
        {...connStyle(connColorIn(agentStates.EdgeCaseAgent), agentStates.EdgeCaseAgent)}
      />
      <path
        d={`M 90 ${C_MID} L 200 ${C_BOT}`}
        {...connStyle(connColorIn(agentStates.PastPRDAgent), agentStates.PastPRDAgent)}
      />

      {/* parallel → Reviewer コネクタ（各並列の右端中央から Reviewer 左端中央 (490, C_MID) へ） */}
      <path
        d={`M 380 ${C_TOP} L 490 ${C_MID}`}
        {...connStyle(connColorOut(agentStates.DecisionAgent), agentStates.DecisionAgent)}
      />
      <path
        d={`M 380 ${C_MID} L 490 ${C_MID}`}
        {...connStyle(connColorOut(agentStates.EdgeCaseAgent), agentStates.EdgeCaseAgent)}
      />
      <path
        d={`M 380 ${C_BOT} L 490 ${C_MID}`}
        {...connStyle(connColorOut(agentStates.PastPRDAgent), agentStates.PastPRDAgent)}
      />

      {/* Planner: 並列中央列に縦中心を合わせる */}
      <PipelineBox x={20} y={Y_MID} w={70} h={BOX_H} centered style={planner} name={PLANNER.fullName} />

      {/* Parallel 3: 8px のギャップ */}
      <PipelineBox x={200} y={Y_TOP} w={180} h={BOX_H} style={decision} name="Decision Agent" />
      <PipelineBox x={200} y={Y_MID} w={180} h={BOX_H} style={edgeCase} name="EdgeCase Agent" />
      <PipelineBox x={200} y={Y_BOT} w={180} h={BOX_H} style={pastPrd} name="Past PRD Agent" />

      {/* Reviewer: 並列中央列に縦中心を合わせる */}
      <PipelineBox x={490} y={Y_MID} w={130} h={BOX_H} centered style={reviewer} name={REVIEWER.fullName} />
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
  const textX = centered ? x + w / 2 : x + 12;
  const anchor = centered ? "middle" : "start";
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={6}
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth={0.5}
      />
      <text
        x={textX}
        y={y + 18}
        textAnchor={anchor}
        style={{ fontSize: "12px", fontWeight: 500, fill: style.textFill }}
      >
        {name}
      </text>
      <text
        x={textX}
        y={y + 32}
        textAnchor={anchor}
        style={{ fontSize: "10px", fill: style.subFill }}
      >
        {style.label}
      </text>
    </g>
  );
}

// styleFor の戻り値の型を取り出すための tiny helper（PipelineBox の prop 型用）。
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
// レーン詳細（dot + 進捗バー）
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

  return (
    <div className="bg-card border-[0.5px] border-border rounded-md p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-block w-2 h-2 rounded-full ${dotClass}`}
            aria-hidden="true"
          />
          <span className="text-xs font-medium">{agent.shortName}</span>
        </div>
        <span
          className={`text-[11px] tabular-nums ${state === "completed" ? "text-success" : "text-text-muted"}`}
        >
          {state === "completed" ? "✓ 完了" : state === "running" ? "実行中" : "待機"}
        </span>
      </div>
      <div className="h-1 bg-bg-secondary rounded-full overflow-hidden mb-2">
        <div
          className={`h-full transition-all duration-500 ${barClass}`}
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <div className="text-[11px] text-text-muted leading-relaxed min-h-[64px]">
        {state === "idle" && <div className="text-text-tertiary">待機中</div>}
        {state === "running" && (
          <div className="text-text-tertiary inline-flex items-center gap-1">
            <svg
              className="animate-spin"
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            分析中…
          </div>
        )}
        {state === "completed" && (
          <div className="text-success inline-flex items-center gap-1">
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            完了
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 経過時間表示
// ---------------------------------------------------------------------------

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
