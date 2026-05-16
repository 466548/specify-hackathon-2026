"""Specify のオーケストレーター。

Planner Agent を 1 回呼んだあと、ConcurrentBuilder で Decision / EdgeCase / PastPRD を
並列実行し、Reviewer aggregator で統合する。

Week 5 で `run_pipeline_streaming()` を新設し、進捗 ProgressEvent を非同期 yield する形に
変更。`run_pipeline()` はその薄ラッパとして残し、CLI と既存テストは無変更で動作する。
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, AsyncIterator

from agent_framework.orchestrations import ConcurrentBuilder
from dotenv import load_dotenv

from .agents.decision import build_decision_agent
from .agents.edge_case import build_edge_case_agent
from .agents.past_prd import build_past_prd_agent
from .agents.planner import build_planner
from .agents.reviewer import build_reviewer_agent, make_reviewer_aggregator
from .notion import fetch_past_prds
from .schemas import PLAN_SCHEMA

# リポジトリルートの .env を読み込む。
# 公式ドキュメント明記: Agent Framework は自動で .env を読まないので、明示的に呼ぶ必要がある。
# このファイルは backend/src/specify_backend/orchestrator.py にあるので、
# 3 階層上がリポジトリルート（specify/）になる。
_REPO_ROOT = Path(__file__).resolve().parents[3]
load_dotenv(_REPO_ROOT / ".env")


# ---------------------------------------------------------------------------
# 進捗イベント
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ProgressEvent:
    """パイプラインの進捗 1 件。

    type は frontend/lib/types.ts の ProgressEventType と語彙を揃える。
    data は type 別の付随情報（executor_id / plan / failure コード / 最終結果 等）。
    """

    type: str
    message: str
    data: dict[str, Any] | None = field(default=None)


# ConcurrentBuilder の event.executor_id のうち、フロントで意味のある id（参考用メモ）。
# - DecisionAgent / EdgeCaseAgent / PastPRDAgent  : 並列 Agent
# - reviewer_aggregator                          : Reviewer 統合
# - dispatcher                                   : ConcurrentBuilder 内部の調整。フロントで除外推奨
#
# このフィルタはバックエンド側ではかけず、全部流す（情報量を保つ）。
# フロント側で「表示する id の集合」を持つ方が表示制御の柔軟性が高い。


def _plan_to_text(plan: dict[str, Any]) -> str:
    """Planner の出力 dict を、後段 Agent への入力に前置きする日本語テキストに整形する。"""
    lines: list[str] = []
    lines.append(f"## ドメイン要約\n{plan.get('domain_summary', '(なし)')}")

    focus_areas = plan.get("focus_areas", []) or []
    if focus_areas:
        lines.append("## 注目する観点")
        lines.extend(f"- {a}" for a in focus_areas)

    concerns = plan.get("concerns_to_check_in_past_prds", []) or []
    if concerns:
        lines.append("## 過去 PRD で確認すべきキーワード")
        lines.extend(f"- {c}" for c in concerns)

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Streaming パイプライン本体
# ---------------------------------------------------------------------------


async def run_pipeline_streaming(prd_text: str) -> AsyncIterator[ProgressEvent]:
    """Specify のメインパイプラインを実行し、進捗を ProgressEvent として yield する。

    フロー:
        1. Planner Agent で分析計画を作成
        2. Notion から過去 PRD を取得（失敗時は空リスト + 失敗コード）
        3. ConcurrentBuilder で 3 並列実行（Decision / EdgeCase / PastPRD）
           各 executor の invoke/complete もそのまま流す
        4. Reviewer aggregator で統合・重複排除（executor_id="reviewer_aggregator"）
        5. output イベントで最終結果を yield

    yield する ProgressEvent.type:
        planner_started / planner_completed / notion_fetch_started / notion_fetch_completed /
        workflow_started / executor_invoked / executor_completed / output / error

    Note:
        - 例外は外に投げず ProgressEvent(type="error") として yield する（SSE 側で event:error）。
        - 既存の stderr print は維持する（CLI 体験を変えないため）。
    """
    # API キー未設定はエラーとして 1 イベント吐いて終了。
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        yield ProgressEvent(
            type="error",
            message=(
                "OPENAI_API_KEY が設定されていません。"
                "リポジトリルートの .env に OPENAI_API_KEY=... を設定してください。"
            ),
        )
        return

    # 1. Planner Agent
    yield ProgressEvent(
        type="planner_started",
        message="Planner Agent: 分析計画を作成中",
    )
    planner_agent = build_planner()
    print("🧭 Planner Agent: 分析計画を作成中...", file=sys.stderr)
    try:
        planner_response = await planner_agent.run(
            prd_text,
            options={"response_format": PLAN_SCHEMA},
        )
        plan: dict[str, Any] = planner_response.value or {
            "domain_summary": "",
            "focus_areas": [],
            "concerns_to_check_in_past_prds": [],
        }
    except Exception as e:
        # Planner 失敗もベストエフォートで継続（空の計画で）。
        print(f"⚠️  Planner Agent が失敗: {e}（空の計画で続行）", file=sys.stderr)
        plan = {
            "domain_summary": "",
            "focus_areas": [],
            "concerns_to_check_in_past_prds": [],
        }
    yield ProgressEvent(
        type="planner_completed",
        message=(
            f"Planner 完了: 観点 {len(plan.get('focus_areas', []))} 個 / "
            f"concerns {len(plan.get('concerns_to_check_in_past_prds', []))} 個"
        ),
        data={"plan": plan},
    )

    # 2. Notion から過去 PRD を取得
    yield ProgressEvent(
        type="notion_fetch_started",
        message="Notion: 過去 PRD を取得中",
    )
    past_prds, notion_failure = fetch_past_prds()
    extra_failed: list[str] = (
        [f"past_prd_agent ({notion_failure})"] if notion_failure else []
    )
    yield ProgressEvent(
        type="notion_fetch_completed",
        message=(
            f"Notion 取得失敗: {notion_failure}（縮退動作）"
            if notion_failure
            else f"Notion: {len(past_prds)} 件取得"
        ),
        data={"count": len(past_prds), "failure": notion_failure},
    )

    # 3. plan + PRD を 1 つのテキストにまとめて並列 Agent に渡す。
    # 各 Agent は同じ入力を受け取る（過去 PRD 本文は Past PRD Agent の system prompt
    # 側で持たせるため、ここには含めない）。
    combined_input = (
        f"# 分析計画（Planner Agent からのヒント）\n{_plan_to_text(plan)}\n\n"
        f"# PRD 本文\n{prd_text}\n"
    )

    # 4. 並列 Agent と Reviewer aggregator を構築
    decision_agent = build_decision_agent()
    edge_case_agent = build_edge_case_agent()
    past_prd_agent = build_past_prd_agent(past_prds=past_prds)
    reviewer_agent = build_reviewer_agent()

    aggregator = make_reviewer_aggregator(
        reviewer_agent,
        extra_failed_agents=extra_failed,
    )

    # ConcurrentBuilder: 3 Agent を並列実行し、結果を aggregator に流す。
    workflow = (
        ConcurrentBuilder(
            participants=[decision_agent, edge_case_agent, past_prd_agent],
        )
        .with_aggregator(aggregator)
        .build()
    )

    print(
        "🧠 並列実行中: Decision / EdgeCase / PastPRD Agent...",
        file=sys.stderr,
    )
    yield ProgressEvent(
        type="workflow_started",
        message="並列実行を開始",
    )

    # 5. ワークフロー実行（streaming で event を受け、必要なものだけフロントに流す）。
    # 観測した event.type と executor_id:
    #   started / status / superstep_started / superstep_completed : 裏方、転送しない
    #   executor_invoked / executor_completed : 5 種類の executor_id（agents + dispatcher + aggregator）
    #   output : aggregator から最終結果（reviewer_aggregator）
    output_data: Any = None
    try:
        async for event in workflow.run(combined_input, stream=True):
            etype = event.type
            executor_id = getattr(event, "executor_id", None)

            if etype in ("executor_invoked", "executor_completed"):
                # dispatcher は ConcurrentBuilder の内部調整。フロントには流すが、
                # 表示するかどうかは UI 側で判断する（情報量を落とさない方針）。
                yield ProgressEvent(
                    type=etype,
                    message=f"{executor_id}: {etype}",
                    data={"executor_id": executor_id},
                )
            elif etype == "output":
                output_data = event.data
            # その他（started / status / superstep_*）は転送しない。
    except Exception as e:
        # ワークフロー実行中の例外もベストエフォートで握って error イベントへ。
        print(f"⚠️  Workflow 実行中に例外: {e}", file=sys.stderr)
        yield ProgressEvent(type="error", message=str(e))
        return

    if output_data is None:
        yield ProgressEvent(
            type="error",
            message="ワークフローから出力が得られませんでした。",
        )
        return

    # 6. 最終 output。data は run_pipeline() の戻り値 dict そのもの。
    yield ProgressEvent(
        type="output",
        message="完了",
        data=output_data,
    )


# ---------------------------------------------------------------------------
# 後方互換ラッパ
# ---------------------------------------------------------------------------


async def run_pipeline(prd_text: str) -> dict[str, Any]:
    """Specify のメインパイプラインを実行する（後方互換用）。

    内部で `run_pipeline_streaming()` を回し、`output` イベントの data を返す。
    既存の `cli.py` / `decision_agent.py` がこの関数を呼んでいるため I/F を維持。

    Returns:
        {
            "summary": str,
            "decisions": [...],
            "contradictions": [...],
            "meta": {"failed_agents": [...]}
        }

    Raises:
        RuntimeError: OPENAI_API_KEY 未設定 / ワークフロー出力なし / その他のエラー
    """
    output: dict[str, Any] | None = None
    error_msg: str | None = None
    async for ev in run_pipeline_streaming(prd_text):
        if ev.type == "output":
            output = ev.data
        elif ev.type == "error":
            error_msg = ev.message
            break
    if error_msg is not None:
        raise RuntimeError(error_msg)
    if output is None:
        raise RuntimeError("ワークフローから出力が得られませんでした。")
    return output
