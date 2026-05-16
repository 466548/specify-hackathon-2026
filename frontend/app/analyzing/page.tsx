"use client";

/**
 * 分析中画面（/analyzing?session=<id>）。
 *
 * Week 5 Step 4: SSE 駆動。バックエンドの /api/analyze に PRD を POST し、
 * named event を受けながら 3 Agent カードの動作状態を更新する。
 * output イベントで結果を sessionStorage に保存し、/result に遷移する。
 */

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { EventList } from "@/components/ui/EventList";
import { loadPrd, saveResult } from "@/lib/session-storage";
import { openAnalyzeStream } from "@/lib/sse-client";
import type { ProgressEvent, Result } from "@/lib/types";

type AgentState = "idle" | "running" | "completed";

interface AgentDef {
  id: string;
  label: string;
  description: string;
}

// /analyzing 画面で見せる Agent 群。dispatcher はバックエンドからは executor として
// 流れてくるが UI 上は表示しない（ConcurrentBuilder の内部調整なので。プラン B-7 参照）。
const PLANNER: AgentDef = {
  id: "PlannerAgent",
  label: "Planner",
  description: "PRD を読んで分析計画を立てる",
};

const PARALLEL_AGENTS: AgentDef[] = [
  {
    id: "DecisionAgent",
    label: "Decision Agent",
    description: "決めるべきことを体系的に列挙",
  },
  {
    id: "EdgeCaseAgent",
    label: "EdgeCase Agent",
    description: "異常系・状態パターンを列挙",
  },
  {
    id: "PastPRDAgent",
    label: "Past PRD Agent",
    description: "過去 PRD から矛盾・漏れを抽出",
  },
];

const REVIEWER: AgentDef = {
  id: "reviewer_aggregator",
  label: "Reviewer",
  description: "3 つの結果を統合・優先度付け",
};

const STATE_LABEL: Record<AgentState, string> = {
  idle: "待機",
  running: "動作中",
  completed: "完了",
};

const STATE_CLASS: Record<AgentState, string> = {
  idle: "text-text-muted",
  running: "text-primary",
  completed: "text-success",
};

function AgentCard({ def, state }: { def: AgentDef; state: AgentState }) {
  return (
    <Card
      className={[
        "flex-1 flex flex-col gap-1",
        state === "running" ? "ring-2 ring-primary" : "",
      ].join(" ")}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{def.label}</span>
        <span className={`text-xs ${STATE_CLASS[state]}`}>
          {state === "running" && (
            <Spinner size={12} className="inline-block mr-1 align-text-bottom" />
          )}
          {STATE_LABEL[state]}
        </span>
      </div>
      <p className="text-xs text-text-muted">{def.description}</p>
    </Card>
  );
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
  const [error, setError] = useState<string | null>(null);

  // React 19 / Next.js 16 dev の Strict Mode 対策。
  //
  // 当初は「初回 mount → 即 cleanup（abort）→ 再 mount で本番 SSE」という公式推奨パターンに
  // 任せていたが、実測で fetch2 の res.body がなぜか空のまま閉じられて受信できない事象が
  // 発生した（おそらく Next dev server / undici 側で abort 直後の同一 URL stream を内部的に
  // 共有/再利用してしまう）。
  //
  // SSE のような long-running side effect では、Strict Mode 下で二度 fetch を開かないのが
  // 安全。useRef でガードし、二回目の mount を skip、初回の cleanup でも abort しない方針に
  // 切り替える。本番（Strict Mode 無効）でも 1 回しか走らないので挙動は同じ。
  // 真の unmount 時は AbortController が GC されて fetch が止まるのに任せる（厳密な
  // キャンセルが必要なら別途 visibilitychange 等で対応する）。
  const sseStartedRef = useRef(false);

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

    sseStartedRef.current = true;

    // SSE を開始。dispatcher は表示用 state に含めないので executor_invoked から弾く。
    // setState 呼び出しはストリームのコールバック内（非同期）なので react-hooks/set-state-in-effect
    // の直接対象にはならず、disable は不要だった。
    openAnalyzeStream(prd, {
      onProgress: (ev) => {
        setEvents((prev) => [...prev, ev]);

        // Planner は executor として流れないので、planner_started/completed で個別更新。
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
      onError: (message) => {
        setError(message);
      },
    });

    // 意図的に cleanup を返さない。Strict Mode の二重 mount cycle で SSE が abort されると
    // Next dev server 経由の二回目の fetch が body 空で返る現象を回避するため。
    // SSE は output イベント受信時の router.push で自然終了する。
  }, [sessionId, router]);

  if (error) {
    return (
      <main className="flex-1 w-full max-w-2xl mx-auto px-6 py-12 flex flex-col gap-4">
        <h1 className="text-xl font-semibold">エラー</h1>
        <Card>
          <p className="text-sm text-error">{error}</p>
        </Card>
        <div className="flex gap-2">
          <Button onClick={() => router.push("/")}>もう一度</Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-6 py-12 flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">分析中...</h1>
        <p className="text-sm text-text-muted">
          Planner → 並列 3 Agent → Reviewer の順で実行しています。
        </p>
      </header>

      {/* Planner */}
      <AgentCard def={PLANNER} state={agentStates.PlannerAgent} />

      {/* 並列 3 Agent */}
      <div className="flex flex-col sm:flex-row gap-3">
        {PARALLEL_AGENTS.map((def) => (
          <AgentCard key={def.id} def={def} state={agentStates[def.id]} />
        ))}
      </div>

      {/* Reviewer */}
      <AgentCard def={REVIEWER} state={agentStates.reviewer_aggregator} />

      {/* 進捗ログ */}
      <Card>
        <h2 className="text-xs font-medium text-text-muted mb-2">進捗ログ</h2>
        <EventList events={events} />
      </Card>
    </main>
  );
}

export default function AnalyzingPage() {
  return (
    <Suspense fallback={null}>
      <AnalyzingInner />
    </Suspense>
  );
}
