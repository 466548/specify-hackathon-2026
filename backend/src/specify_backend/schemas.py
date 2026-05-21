"""Specify で使う JSON Schema を集約。

各エージェントの構造化出力を一元管理する。OpenAI Structured Outputs (strict モード) に
準拠するため、すべてのプロパティを required + additionalProperties: false にする。
"""

from __future__ import annotations

from typing import Any

# Planner Agent の出力スキーマ。
# PRD の特性を踏まえた分析計画を返す（具体的な論点抽出は後段の並列 Agent に任せる）。
PLAN_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "domain_summary": {
            "type": "string",
            "description": "PRD のドメインを 1 文で要約",
        },
        "focus_areas": {
            "type": "array",
            "items": {"type": "string"},
            "description": "論点が集中しそうな観点（3〜6 個）",
        },
        "concerns_to_check_in_past_prds": {
            "type": "array",
            "items": {"type": "string"},
            "description": "過去 PRD で確認すべき矛盾候補のキーワード（2〜4 個）",
        },
    },
    "required": ["domain_summary", "focus_areas", "concerns_to_check_in_past_prds"],
    "additionalProperties": False,
}


# Decision / EdgeCase / Reviewer Agent の共通出力スキーマ。
# Week 2 と同じ構造（priority/category/options 最低 3/rationale）。
DECISION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "decisions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "priority": {
                        "type": "string",
                        "enum": ["must", "should", "nice"],
                    },
                    "category": {
                        "type": "string",
                        "enum": [
                            "validation",
                            "empty_state",
                            "loading",
                            "error",
                            "edge_case",
                            "domain",
                            "other",
                        ],
                    },
                    "options": {
                        "type": "array",
                        "items": {"type": "string"},
                        "minItems": 3,
                    },
                    "rationale": {"type": "string"},
                    "source": {
                        "type": "string",
                        "enum": ["past_prd", "agent"],
                        "description": (
                            "decision の由来。past_prd = 過去 PRD との矛盾から派生"
                            "（Reviewer による格上げ or 新規追加）。"
                            "agent = Decision/EdgeCase Agent からそのまま流れた通常出力。"
                        ),
                    },
                },
                "required": ["title", "priority", "category", "options", "rationale", "source"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["summary", "decisions"],
    "additionalProperties": False,
}


# Past PRD Agent の出力スキーマ。
# 過去 PRD と新 PRD の矛盾候補を列挙する。priority は decisions と同じ enum で統一。
CONTRADICTION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "contradictions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "past_prd_id": {"type": "string"},
                    "past_prd_quote": {"type": "string"},
                    "new_prd_quote": {"type": "string"},
                    "priority": {
                        "type": "string",
                        "enum": ["must", "should", "nice"],
                    },
                    "rationale": {"type": "string"},
                },
                "required": [
                    "title",
                    "past_prd_id",
                    "past_prd_quote",
                    "new_prd_quote",
                    "priority",
                    "rationale",
                ],
                "additionalProperties": False,
            },
        },
    },
    "required": ["contradictions"],
    "additionalProperties": False,
}
