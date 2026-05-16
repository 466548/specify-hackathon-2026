"use client";

/**
 * 結果画面（/result?session=<id>）。
 *
 * sessionStorage から Result を引いて表示する。Step 2 ではプレビューは出さず、
 * decisions / contradictions / failed_agents バナーまで。プレビューは Step 5 で追加。
 */

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CategoryBadge, PriorityBadge } from "@/components/ui/Badge";
import { loadResult } from "@/lib/session-storage";
import type { Contradiction, Decision, Priority, Result } from "@/lib/types";
import { MockModalPreview } from "./MockModalPreview";

const PRIORITY_ORDER: Priority[] = ["must", "should", "nice"];

function groupByPriority<T extends { priority: Priority }>(items: T[]) {
  return PRIORITY_ORDER.map((p) => ({
    priority: p,
    items: items.filter((x) => x.priority === p),
  })).filter((g) => g.items.length > 0);
}

function DecisionItem({ decision }: { decision: Decision }) {
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <PriorityBadge priority={decision.priority} />
        <CategoryBadge category={decision.category} />
        <span className="text-sm font-medium">{decision.title}</span>
      </div>
      <div className="text-xs text-text-muted">
        選択肢: {decision.options.join(" / ")}
      </div>
      <div className="text-xs text-text">{decision.rationale}</div>
    </Card>
  );
}

function ContradictionItem({ c }: { c: Contradiction }) {
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <PriorityBadge priority={c.priority} />
        <span className="text-sm font-medium">{c.title}</span>
      </div>
      <div className="text-xs text-text-muted font-mono break-all">
        {c.past_prd_id}
      </div>
      <div className="text-xs">
        <div>
          <span className="text-text-muted">過去: </span>
          {c.past_prd_quote}
        </div>
        <div>
          <span className="text-text-muted">新: </span>
          {c.new_prd_quote}
        </div>
      </div>
      <div className="text-xs text-text">{c.rationale}</div>
    </Card>
  );
}

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

function ResultInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");

  const [result, setResult] = useState<Result | null>(null);

  // sessionStorage は SSR で no-op のためマウント後に effect で読む。
  // react-hooks/set-state-in-effect の suppress 理由は page.tsx と同じ。
  useEffect(() => {
    if (!sessionId) {
      router.replace("/");
      return;
    }
    const r = loadResult(sessionId);
    if (!r) {
      router.replace("/");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResult(r);
  }, [sessionId, router]);

  if (!result) {
    // result 取得待ちは空。ほぼ即座に setResult されるので skeleton も不要。
    return null;
  }

  const decisionGroups = groupByPriority(result.decisions);
  const contradictionGroups = groupByPriority(result.contradictions);

  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-6 py-12 flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">分析結果</h1>
        <p className="text-sm text-text-muted">{result.summary}</p>
      </header>

      <FailedBanner failed={result.meta.failed_agents} />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          決めるべきこと（{result.decisions.length} 件）
        </h2>
        {result.decisions.length === 0 ? (
          <p className="text-sm text-text-muted">
            未確定の論点は検出されませんでした。PRD が十分に具体的か、もしくは短すぎて Agent
            が抽出できなかった可能性があります。
          </p>
        ) : (
          decisionGroups.map((g) => (
            <div key={g.priority} className="flex flex-col gap-2">
              <h3 className="text-sm font-medium text-text-muted">
                <PriorityBadge priority={g.priority} /> {g.items.length} 件
              </h3>
              <div className="flex flex-col gap-2">
                {g.items.map((d, i) => (
                  <DecisionItem key={i} decision={d} />
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          過去 PRD との矛盾（{result.contradictions.length} 件）
        </h2>
        {result.contradictions.length === 0 ? (
          <p className="text-sm text-text-muted">矛盾は検出されませんでした。</p>
        ) : (
          contradictionGroups.map((g) => (
            <div key={g.priority} className="flex flex-col gap-2">
              <h3 className="text-sm font-medium text-text-muted">
                <PriorityBadge priority={g.priority} /> {g.items.length} 件
              </h3>
              <div className="flex flex-col gap-2">
                {g.items.map((c, i) => (
                  <ContradictionItem key={i} c={c} />
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      <MockModalPreview />

      <div className="flex justify-end">
        <Button variant="secondary" onClick={() => router.push("/")}>
          新しい PRD を分析
        </Button>
      </div>
    </main>
  );
}

export default function ResultPage() {
  return (
    <Suspense fallback={null}>
      <ResultInner />
    </Suspense>
  );
}
