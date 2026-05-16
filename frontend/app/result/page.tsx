"use client";

/**
 * 結果画面（/result?session=<id>）。
 *
 * Week 6 デザイン磨き (5/18) で「読み物」から「意思決定可能な UI」に格上げ。
 * モック: Downloads/03_specify_result.html を参考に、
 *   - 矛盾アラートを上部の警告バナーに格上げ（過去 PRD との矛盾を最も目立つ位置に）
 *   - フィルタタブ（すべて / 必須 / 推奨 / 未決定）
 *   - 各論点カード:
 *       選択肢ボタン → メモ入力 → 決定ボタン → 「決定済み」ステータス
 *       選択肢が決まらないと決定ボタンは disabled。決定すると進捗バーが進む
 *   - 全件決定で「Notion / Markdown エクスポート」が有効化（実エクスポートはまだ）
 *
 * 状態保存: ページリロードで決定状態を失わないよう sessionStorage に保持
 * （session 単位、Result 以外の画面では使わない）。
 */

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { loadPrdId, loadResult } from "@/lib/session-storage";
import type { Contradiction, Decision, Priority, Result } from "@/lib/types";
import { MockModalPreview } from "./MockModalPreview";

// MockModalPreview は KintaiKit ユーザー追加モーダルに特化した mock のため、
// 同じ PRD を選んだ時だけ表示する。
const PRD_IDS_WITH_PREVIEW = new Set(["user-add"]);

// 1 つの論点に対するユーザーの決定状態。
interface DecisionState {
  selectedOption: string | null;
  memo: string;
  decided: boolean;
}

type FilterValue = "all" | "must" | "should" | "undecided";

// 決定状態の sessionStorage キー。Result 内専用なのでこのファイルに閉じる。
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

  // sessionStorage は SSR で no-op のためマウント後に effect で読む。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResult(null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrdId(null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDecisionStates({});
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrdId(loadPrdId(sessionId));
    // 既存の決定状態を復元（ブラウザバック対応）。
    const saved = loadDecisionStates(sessionId);
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDecisionStates(saved);
    }
  }, [sessionId, router]);

  // decisionStates が変わるたびに sessionStorage に書き戻す。
  useEffect(() => {
    if (!sessionId || !result) return;
    saveDecisionStates(sessionId, decisionStates);
  }, [sessionId, result, decisionStates]);

  const decidedCount = useMemo(
    () => Object.values(decisionStates).filter((s) => s.decided).length,
    [decisionStates],
  );

  // フィルタ後の decisions（index 情報を保持したまま絞る）。
  const filteredDecisions = useMemo(() => {
    if (!result) return [];
    return result.decisions
      .map((d, i) => ({ d, i }))
      .filter(({ d, i }) => {
        if (filter === "all") return true;
        if (filter === "must") return d.priority === "must";
        if (filter === "should") return d.priority === "should";
        if (filter === "undecided") return !decisionStates[i]?.decided;
        return true;
      });
  }, [result, filter, decisionStates]);

  if (!result) return null;

  const total = result.decisions.length;
  const progressPct = total === 0 ? 0 : Math.round((decidedCount / total) * 100);
  const allDecided = total > 0 && decidedCount === total;

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
      if (!cur?.selectedOption) return prev; // 選択肢未選択なら何もしない（UI で disabled だが保険）
      return {
        ...prev,
        [decisionIdx]: { ...cur, decided: true },
      };
    });
  }

  const filterCounts = {
    all: total,
    must: result.decisions.filter((d) => d.priority === "must").length,
    should: result.decisions.filter((d) => d.priority === "should").length,
    undecided:
      total - Object.values(decisionStates).filter((s) => s.decided).length,
  };

  return (
    <main className="flex-1 w-full max-w-2xl mx-auto px-6 py-8 flex flex-col gap-4">
      {/* ヘッダ */}
      <header className="flex flex-col gap-1 mb-2">
        <h1 className="text-[22px] font-medium tracking-tight m-0">分析結果</h1>
        <p className="text-sm text-text-muted m-0">{result.summary}</p>
      </header>

      <FailedBanner failed={result.meta.failed_agents} />

      {/* Step 2: 論点を決定する */}
      <Card>
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2">
            <div className="w-[22px] h-[22px] rounded-full bg-bg-info text-text-info flex items-center justify-center text-xs font-medium">
              2
            </div>
            <span className="text-sm font-medium">論点を決定する</span>
          </div>
          <div className="flex items-center gap-2.5 text-xs text-text-muted">
            <span>
              決定済み{" "}
              <span className="text-text font-medium">{decidedCount}</span> /{" "}
              <span>{total}</span>
            </span>
            <div className="w-[100px] h-1.5 bg-bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-text-info transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* 矛盾アラート（最上部に格上げ） */}
        <ContradictionAlert contradictions={result.contradictions} />

        {/* フィルタタブ */}
        <div className="flex gap-1.5 mb-3 flex-wrap">
          <FilterTab
            active={filter === "all"}
            onClick={() => setFilter("all")}
            count={filterCounts.all}
          >
            すべて
          </FilterTab>
          <FilterTab
            active={filter === "must"}
            onClick={() => setFilter("must")}
            count={filterCounts.must}
          >
            🔴 必須
          </FilterTab>
          <FilterTab
            active={filter === "should"}
            onClick={() => setFilter("should")}
            count={filterCounts.should}
          >
            🟡 推奨
          </FilterTab>
          <FilterTab
            active={filter === "undecided"}
            onClick={() => setFilter("undecided")}
          >
            未決定のみ
          </FilterTab>
        </div>

        {/* 論点カード一覧 */}
        <div className="flex flex-col gap-2.5">
          {filteredDecisions.length === 0 ? (
            <p className="text-sm text-text-muted py-4 text-center">
              該当する論点はありません。
            </p>
          ) : (
            filteredDecisions.map(({ d, i }) => (
              <DecisionCard
                key={i}
                decision={d}
                state={
                  decisionStates[i] ?? {
                    selectedOption: null,
                    memo: "",
                    decided: false,
                  }
                }
                onSelectOption={(opt) => handleSelectOption(i, opt)}
                onMemoChange={(m) => handleMemoChange(i, m)}
                onDecide={() => handleDecide(i)}
              />
            ))
          )}
        </div>
      </Card>

      {/* Step 3: 画面プレビュー（user-add のみ） */}
      {prdId && PRD_IDS_WITH_PREVIEW.has(prdId) && <MockModalPreview />}

      {/* エクスポートバー */}
      <div className="bg-bg-secondary rounded-lg px-4 py-3.5 flex items-center justify-between gap-3 mt-2">
        <div>
          <p className="text-[13px] font-medium m-0 mb-0.5">
            決定事項を反映した改訂版 PRD をエクスポート
          </p>
          <p className="text-[11px] text-text-muted m-0">
            すべての論点を決定すると有効になります
          </p>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={!allDecided}
            className="text-xs px-3 py-1.5 bg-card border-[0.5px] border-border-strong rounded-md disabled:opacity-50 hover:bg-bg-secondary"
          >
            Notion
          </button>
          <button
            type="button"
            disabled={!allDecided}
            className="text-xs px-3 py-1.5 bg-card border-[0.5px] border-border-strong rounded-md disabled:opacity-50 hover:bg-bg-secondary"
          >
            Markdown
          </button>
        </div>
      </div>

      <div className="flex justify-end mt-2">
        <Button variant="secondary" onClick={() => router.push("/")}>
          新しい PRD を分析
        </Button>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// 矛盾アラート（最上部）
// ---------------------------------------------------------------------------

function ContradictionAlert({
  contradictions,
}: {
  contradictions: Contradiction[];
}) {
  const [expanded, setExpanded] = useState(false);
  if (contradictions.length === 0) return null;

  return (
    <div className="bg-bg-warning border-l-[3px] border-warning px-3.5 py-2.5 mb-3.5 rounded-r-md">
      <div className="flex items-start gap-2.5">
        <svg
          className="text-warning flex-shrink-0 mt-0.5"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <div className="flex-1">
          <p className="text-[13px] font-medium text-warning m-0 mb-0.5">
            過去 PRD との矛盾が {contradictions.length} 件あります
          </p>
          <p className="text-xs text-text-muted m-0">
            既存方針 PRD と食い違っています。詳細を確認の上、論点の決定に反映してください。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-xs px-3 py-1 bg-card border-[0.5px] border-border-strong rounded-md hover:bg-bg-secondary flex-shrink-0"
        >
          {expanded ? "閉じる" : "詳細"}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 flex flex-col gap-2">
          {contradictions.map((c, i) => (
            <div
              key={i}
              className="text-xs bg-card border border-border rounded-md p-2.5 flex flex-col gap-1"
            >
              <div className="font-medium">{c.title}</div>
              <div className="font-mono text-text-tertiary break-all">
                {c.past_prd_id}
              </div>
              <div>
                <span className="text-text-tertiary">過去: </span>
                {c.past_prd_quote}
              </div>
              <div>
                <span className="text-text-tertiary">新: </span>
                {c.new_prd_quote}
              </div>
              <div className="text-text">{c.rationale}</div>
            </div>
          ))}
        </div>
      )}
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
        "text-xs px-3 py-[5px] rounded-md border-[0.5px] border-border-strong transition",
        active ? "bg-bg-secondary" : "bg-card hover:bg-bg-secondary",
      ].join(" ")}
    >
      {children}
      {count !== undefined && (
        <span className="text-text-tertiary ml-1">{count}</span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// 論点カード（意思決定 UI）
// ---------------------------------------------------------------------------

function DecisionCard({
  decision,
  state,
  onSelectOption,
  onMemoChange,
  onDecide,
}: {
  decision: Decision;
  state: DecisionState;
  onSelectOption: (opt: string) => void;
  onMemoChange: (memo: string) => void;
  onDecide: () => void;
}) {
  const { selectedOption, memo, decided } = state;
  const canDecide = selectedOption !== null && !decided;

  return (
    <div
      className={[
        "border-[0.5px] border-border rounded-md p-3.5 bg-card transition",
        decided ? "bg-bg-secondary opacity-90" : "",
      ].join(" ")}
    >
      {/* タグ行 */}
      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
        <PriorityBadgeNew priority={decision.priority} />
        <span className="text-[11px] px-2 py-0.5 rounded-md bg-bg-secondary text-text-muted">
          {categoryLabel(decision.category)}
        </span>
        <span
          className={[
            "ml-auto text-[11px]",
            decided ? "text-success font-medium" : "text-text-tertiary",
          ].join(" ")}
        >
          {decided ? "✓ 決定済み" : "未決定"}
        </span>
      </div>

      <p className="text-sm font-medium m-0 mb-1">{decision.title}</p>
      <p className="text-xs text-text-muted m-0 mb-2.5 leading-relaxed">
        {decision.rationale}
      </p>

      {/* 選択肢 */}
      <div className="flex gap-1.5 flex-wrap mb-2">
        {decision.options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => !decided && onSelectOption(opt)}
            disabled={decided}
            className={[
              "text-xs px-2.5 py-[5px] rounded-md border-[0.5px] transition",
              selectedOption === opt
                ? "bg-bg-info text-text-info border-text-info"
                : "bg-card border-border-strong hover:bg-bg-secondary",
              decided ? "cursor-default" : "",
            ].join(" ")}
          >
            {opt}
          </button>
        ))}
      </div>

      {/* メモ + 決定ボタン */}
      <div className="flex gap-2 items-center">
        <input
          type="text"
          value={memo}
          onChange={(e) => onMemoChange(e.target.value)}
          placeholder="メモ (任意)"
          aria-label="メモ"
          disabled={decided}
          className="flex-1 h-[30px] text-xs font-sans px-2.5 bg-card border-[0.5px] border-border-strong rounded-md focus:outline-none focus:border-text-info disabled:bg-bg-secondary"
        />
        <button
          type="button"
          onClick={onDecide}
          disabled={!canDecide}
          className={[
            "text-xs px-3 py-[5px] rounded-md border-[0.5px] border-border-strong inline-flex items-center gap-1 transition",
            canDecide
              ? "bg-card hover:bg-bg-secondary"
              : "bg-card opacity-40 cursor-not-allowed",
          ].join(" ")}
        >
          決定
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Priority バッジ（モックの色合いに変更）
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
