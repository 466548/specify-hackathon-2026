"""Reviewer Agent + ConcurrentBuilder の custom aggregator。

3 並列エージェント（Decision / EdgeCase / PastPRD）の結果を統合する。
Decision + EdgeCase は意味的に重なる論点があるので Reviewer Agent で重複排除する。
PastPRD は別フィールド（contradictions）として横に並べる。
"""

from __future__ import annotations

import json
import sys
from typing import Any, Awaitable, Callable

from agent_framework.openai import OpenAIChatClient

from ..schemas import DECISION_SCHEMA

REVIEWER_SYSTEM_PROMPT = """# システム定義

機能: 複数の専門エージェントが出した意思決定論点リストを統合・重複排除・優先度再付与する
入力: Decision Agent / EdgeCase Agent の生 JSON 出力 + Past PRD Agent の矛盾リスト（参照用）
出力: 統合後の意思決定論点リスト（schema は単一 Agent のものと同じ）

# 統合ルール

- 完全重複・近接重複は 1 件にマージ（タイトルが意味的に同じなら）
- マージ時は options を和集合（重複なしで結合）
- マージ時の rationale はより具体的・ドメイン固有の方を採用
- 優先度衝突時は Decision Agent 側の判断を尊重する（Edge Case Agent は通常 must/should が多くなる）
- 統合後は 10〜15 件程度に収める
- summary は両 Agent の summary を踏まえた 1〜2 文

# Past PRD 矛盾との合流ルール

入力テキストに Past PRD Agent の矛盾リスト（contradictions）が含まれる。

## マッチング判断の原則

【重要】contradiction と decision のマッチングは、contradiction の `title` ではなく
`past_prd_quote`（過去 PRD の実際の要件文）の内容で判断する。
title は要約であり不正確な場合があるため、必ず past_prd_quote を読んで要件を確認すること。

例:
- past_prd_quote「ユーザー追加・削除は必ず操作ログに残す」
  → 「操作ログ」「監査ログ」「操作履歴」に関する decision が対応する
  → 「ユーザー権限」「表示制御」に関する decision は対応しない（別要件）

## パターン A: 対応する decision が既にある場合

`past_prd_quote` の要件と decisions リストの各 decision を照合し、
**具体的に同じ要件**（抽象レベルで「関連する」では不十分）を扱う decision があれば格上げする。

格上げ条件:
1. past_prd_quote の要件と decision の要件が実質的に同じ
2. 格上げが合理的（関係が薄い decision を無理に格上げしない）

格上げした場合、rationale の末尾に「（Past PRD [past_prd_id] との矛盾により格上げ）」を追記する。

## パターン B: 対応する decision が存在しない場合（重要）

`past_prd_quote` の要件に対応する decision が decisions リストにない場合（パターン A が適用できない場合）、
その contradiction から新規 decision を作成して decisions リストに追加する。

新規 decision の作り方:
- title: 「[past_prd_quote の主題] の方針」（例:「操作ログ・監査要件の有無」）
- priority: must（Past PRD で決定済みの要件が新 PRD に漏れているため）
- category: domain
- options: 必ず 3 つ作る。以下のパターンで構成する:
  1. 過去 PRD の決定を踏襲する（past_prd_quote の内容をそのまま適用）
  2. 新 PRD のスコープでは対応しない（別チケットに切り出す）
  3. 部分的に適用する（ハイブリッド案・条件付き適用など）
- rationale: 「過去 PRD [past_prd_id] では「[past_prd_quote]」と決定されているが、新 PRD では言及がない。実装着手前に方針を確認する必要がある。」

# 注意

- 出力は決定論点リストのみ（contradictions は出力しない。Past PRD の矛盾は参照専用）
- 出力は呼び出し側の JSON Schema に厳密に準拠させる（priority/category/options 最低 3 つ）

# 出力言語

すべて日本語で出力する。"""


def build_reviewer_agent(model: str = "gpt-4o-mini"):
    """Reviewer Agent を構築して返す。"""
    return OpenAIChatClient(model=model).as_agent(
        name="ReviewerAgent",
        instructions=REVIEWER_SYSTEM_PROMPT,
        default_options={"response_format": DECISION_SCHEMA},
    )


def _extract_text(agent_executor_response: Any) -> str:
    """AgentExecutorResponse から最終アシスタントメッセージのテキストを取り出す。

    Agent Framework の AgentResponse は messages: list[Message] を持ち、
    各 message には text 属性がある（最後の要素が最終出力）。
    """
    agent_response = getattr(agent_executor_response, "agent_response", None)
    if agent_response is None:
        return ""
    messages = getattr(agent_response, "messages", []) or []
    if not messages:
        return ""
    last = messages[-1]
    return getattr(last, "text", "") or ""


def _parse_json_safe(text: str) -> dict[str, Any] | None:
    """JSON テキストをパースする。失敗したら None。

    response_format による strict モードを使っているので通常は失敗しないが、
    ベストエフォート方針なのでここで吸収する。
    """
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def make_reviewer_aggregator(
    reviewer_agent: Any,
    extra_failed_agents: list[str] | None = None,
) -> Callable[[list[Any]], Awaitable[dict[str, Any]]]:
    """Reviewer aggregator のクロージャを作って返す。

    ConcurrentBuilder.with_aggregator() に渡す。Reviewer Agent は引数で受けて
    クロージャに閉じ込める（呼び出しごとにエージェントを作り直さないため）。

    Args:
        reviewer_agent: Reviewer Agent インスタンス
        extra_failed_agents: パイプライン外で発生した失敗を meta.failed_agents に
            含めたいときに渡す。例: Notion 取得失敗時に
            ["past_prd_agent (notion_fetch_failed)"] を渡すと、Past PRD Agent は
            空結果（contradictions: []）を返す一方で、meta から「縮退動作中」が
            判別できる。
    """

    # 呼び出しごとにリストを共有しないよう、クロージャ側で snapshot を取る。
    _extra_failed = list(extra_failed_agents or [])

    async def reviewer_aggregator(results: list[Any]) -> dict[str, Any]:
        """3 Agent の結果を統合する。

        Args:
            results: list[AgentExecutorResponse]
        """
        # executor_id ごとにパース結果を持つ。
        by_id: dict[str, dict[str, Any] | None] = {}
        for r in results:
            executor_id = getattr(r, "executor_id", "unknown")
            text = _extract_text(r)
            by_id[executor_id] = _parse_json_safe(text)

        decision_out = by_id.get("DecisionAgent") or {"summary": "", "decisions": []}
        edge_case_out = by_id.get("EdgeCaseAgent") or {"summary": "", "decisions": []}
        past_prd_out = by_id.get("PastPRDAgent") or {"contradictions": []}

        # ベストエフォート: 失敗 Agent の名前を記録（stderr 警告 + meta に含める）
        failed_agents: list[str] = [name for name, val in by_id.items() if val is None]
        for name in failed_agents:
            print(f"⚠️  Agent が失敗: {name}", file=sys.stderr)

        # パイプライン外の失敗（Notion 取得失敗など）を前置きで積む。
        # 既に同じ理由が積まれていたら重複させない。
        for tag in _extra_failed:
            if tag not in failed_agents:
                failed_agents.insert(0, tag)

        # Reviewer Agent を呼んで Decision + EdgeCase を統合する。
        # 両方とも空なら Reviewer 呼び出しはスキップ（API コスト節約）。
        if decision_out.get("decisions") or edge_case_out.get("decisions"):
            reviewer_input = (
                "# Decision Agent の出力\n"
                f"{json.dumps(decision_out, ensure_ascii=False, indent=2)}\n\n"
                "# Edge Case Agent の出力\n"
                f"{json.dumps(edge_case_out, ensure_ascii=False, indent=2)}\n\n"
                "# Past PRD Agent の矛盾リスト（参照用・格上げ判断に使う）\n"
                f"{json.dumps(past_prd_out, ensure_ascii=False, indent=2)}\n"
            )
            print("🧪 Reviewer Agent: 統合中...", file=sys.stderr)
            try:
                reviewer_response = await reviewer_agent.run(
                    reviewer_input,
                    options={"response_format": DECISION_SCHEMA},
                )
                merged: dict[str, Any] = (
                    reviewer_response.value
                    if reviewer_response.value is not None
                    else {"summary": "", "decisions": []}
                )
            except Exception as e:
                print(f"⚠️  Reviewer Agent が失敗: {e}", file=sys.stderr)
                # フォールバック: 単純結合（重複排除なし）
                merged = {
                    "summary": (
                        decision_out.get("summary", "")
                        or edge_case_out.get("summary", "")
                    ),
                    "decisions": (
                        list(decision_out.get("decisions", []))
                        + list(edge_case_out.get("decisions", []))
                    ),
                }
                failed_agents.append("ReviewerAgent")
        else:
            merged = {"summary": "", "decisions": []}

        return {
            "summary": merged.get("summary", ""),
            "decisions": merged.get("decisions", []),
            "contradictions": past_prd_out.get("contradictions", []),
            "meta": {"failed_agents": failed_agents},
        }

    return reviewer_aggregator
