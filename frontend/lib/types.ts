/**
 * Specify バックエンドの返却型を TypeScript で表現したもの。
 *
 * バックエンド側のソース・オブ・トゥルース:
 *   backend/src/specify_backend/schemas.py
 *
 * 同期させる必要があるのは:
 *   - DECISION_SCHEMA.properties.decisions.items.properties.priority.enum
 *     → Priority
 *   - DECISION_SCHEMA.properties.decisions.items.properties.category.enum
 *     → Category
 *   - run_pipeline() の戻り値の構造（summary / decisions / contradictions / meta）
 *     → Result
 *
 * Drift 注意: 上記 enum を変更したらここも追従する。CI で照合する仕組みは未整備（Week 6 以降）。
 */

export type Priority = "must" | "should" | "nice";

export type Category =
  | "validation"
  | "empty_state"
  | "loading"
  | "error"
  | "edge_case"
  | "domain"
  | "other";

/** 意思決定論点 1 件（Decision Agent / EdgeCase Agent / Reviewer の出力単位）。 */
export interface Decision {
  title: string;
  priority: Priority;
  category: Category;
  /** 決めるべき選択肢。最低 3 つ（schemas.py の minItems: 3）。 */
  options: string[];
  rationale: string;
  /**
   * 由来。past_prd = 過去 PRD との矛盾から派生（Reviewer が格上げ or 新規追加）、
   * agent = 通常の Decision/EdgeCase Agent 出力。
   * Reviewer 側で必ずセットされる（LLM 忘れの場合も rationale マッチで上書き）。
   */
  source: "past_prd" | "agent";
}

/** 過去 PRD との矛盾 1 件（Past PRD Agent の出力単位）。 */
export interface Contradiction {
  title: string;
  /** Notion page id（uuid 形式）。 */
  past_prd_id: string;
  past_prd_quote: string;
  /** 新 PRD からの引用、または「言及なし」。 */
  new_prd_quote: string;
  priority: Priority;
  rationale: string;
}

/** run_pipeline() の最終返却値。/api/analyze/sync の JSON ボディと一致。 */
export interface Result {
  summary: string;
  decisions: Decision[];
  contradictions: Contradiction[];
  meta: {
    /**
     * 失敗 Agent 名（Week 4 で reason code 化済み）。
     * 例: ["past_prd_agent (notion_api_key_missing)"]
     */
    failed_agents: string[];
  };
}

// ---------------------------------------------------------------------------
// SSE 進捗イベント（Week 5 Step 4 で実装。Step 2 では未使用だが先に型定義しておく）
// ---------------------------------------------------------------------------

/**
 * SSE で流れる named event の種類。
 *
 * オーケストレーターの ProgressEvent.type と、SSE の event 名は同じ語彙を使う
 * （命名を 1 箇所に集約）。Step 3 でバックエンド側にも同名 enum を作る。
 */
export type ProgressEventType =
  // オーケストレーター起源
  | "planner_started"
  | "planner_completed"
  | "notion_fetch_started"
  | "notion_fetch_completed"
  | "workflow_started"
  | "reviewer_started"
  | "reviewer_completed"
  // ConcurrentBuilder 由来（executor_id を data に持つ）
  | "executor_invoked"
  | "executor_completed"
  // 終端
  | "output"
  | "error";

/** SSE 1 メッセージ。SSE フォーマットでは `event: <type>\ndata: <JSON>\n\n`。 */
export interface ProgressEvent {
  type: ProgressEventType;
  message: string;
  /** type 別の付随情報。executor_id / failed reason / Planner の focus_areas など。 */
  data?: unknown;
}

// ---------------------------------------------------------------------------
// エラー分類（backend/src/specify_backend/errors.py と語彙を揃える）
// ---------------------------------------------------------------------------

/**
 * エラー種別。フロントの /analyzing がこの値で UI 分岐する:
 *   - リトライ可能 (retryable=true): rate_limit / timeout / unknown
 *     → 「再試行」「最初に戻る」の 2 ボタン
 *   - リトライ不能 (retryable=false): auth / credit_exhausted
 *     → 「最初に戻る」のみ
 */
export type ErrorType =
  | "rate_limit"
  | "timeout"
  | "auth"
  | "credit_exhausted"
  | "unknown";

/** SSE の error イベントで来る data 部の構造。 */
export interface ErrorPayload {
  error_type: ErrorType;
  retryable: boolean;
}
