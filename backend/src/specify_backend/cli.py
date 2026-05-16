"""CLI エントリポイント。

使い方:
    uv run specify --prd-file ../demo-data/sample-prd.md
    uv run specify --prd "ユーザー追加モーダルを作る..."
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path
from typing import Any

from .decision_agent import analyze_prd

# 優先度ごとの表示用ラベル
_PRIORITY_LABELS: dict[str, str] = {
    "must": "🔴 必須",
    "should": "🟡 推奨",
    "nice": "🟢 任意",
}

# 優先度の表示順（must が先）
_PRIORITY_ORDER: list[str] = ["must", "should", "nice"]


def _format_result(result: dict[str, Any]) -> str:
    """run_pipeline の結果を人間が読みやすい形に整形する。

    Week 3 から contradictions（過去 PRD との矛盾）セクションが追加されている。
    decisions と contradictions は priority enum を共通化（must/should/nice）してあるので、
    同じ _PRIORITY_LABELS / _PRIORITY_ORDER で整形できる。
    """
    lines: list[str] = []

    summary = result.get("summary", "")
    lines.append("📋 概要")
    lines.append(summary)

    # ----- 意思決定論点 -----
    decisions: list[dict[str, Any]] = result.get("decisions", [])
    if decisions:
        lines.append("")
        lines.append(f"# 意思決定論点 ({len(decisions)}件)")

        for priority in _PRIORITY_ORDER:
            bucket = [d for d in decisions if d.get("priority") == priority]
            if not bucket:
                continue
            label = _PRIORITY_LABELS.get(priority, priority)
            lines.append("")
            lines.append(f"{label} ({len(bucket)}件)")
            for i, d in enumerate(bucket, start=1):
                title = d.get("title", "(no title)")
                category = d.get("category", "")
                options = d.get("options", [])
                rationale = d.get("rationale", "")
                lines.append(f"  {i}. {title} [{category}]")
                if options:
                    lines.append(f"     選択肢: {' / '.join(options)}")
                if rationale:
                    lines.append(f"     根拠: {rationale}")

    # ----- 過去 PRD との矛盾 -----
    contradictions: list[dict[str, Any]] = result.get("contradictions", [])
    if contradictions:
        lines.append("")
        lines.append(f"# 過去 PRD との矛盾 ({len(contradictions)}件)")

        for priority in _PRIORITY_ORDER:
            bucket = [c for c in contradictions if c.get("priority") == priority]
            if not bucket:
                continue
            label = _PRIORITY_LABELS.get(priority, priority)
            lines.append("")
            lines.append(f"{label} ({len(bucket)}件)")
            for i, c in enumerate(bucket, start=1):
                title = c.get("title", "(no title)")
                past_prd_id = c.get("past_prd_id", "")
                past_quote = c.get("past_prd_quote", "")
                new_quote = c.get("new_prd_quote", "")
                rationale = c.get("rationale", "")
                lines.append(f"  {i}. {title} [{past_prd_id}]")
                if past_quote:
                    lines.append(f"     過去: {past_quote}")
                if new_quote:
                    lines.append(f"     新:   {new_quote}")
                if rationale:
                    lines.append(f"     根拠: {rationale}")

    # ----- meta（失敗 Agent 等） -----
    meta = result.get("meta", {}) or {}
    failed = meta.get("failed_agents") or []
    if failed:
        lines.append("")
        lines.append(f"⚠️  失敗した Agent: {', '.join(failed)}")

    return "\n".join(lines)


def _read_prd_text(args: argparse.Namespace) -> str:
    """--prd-file または --prd から PRD テキストを取り出す。"""
    if args.prd_file:
        path = Path(args.prd_file)
        if not path.exists():
            raise FileNotFoundError(f"PRD ファイルが見つかりません: {path}")
        return path.read_text(encoding="utf-8")
    if args.prd:
        return args.prd
    # argparse の mutually exclusive で防いでいるが念のため
    raise ValueError("--prd-file か --prd のどちらかを指定してください。")


def main() -> int:
    """エントリポイント。pyproject.toml の [project.scripts] から呼ばれる。"""
    parser = argparse.ArgumentParser(
        prog="specify",
        description="PRD から未定義の意思決定論点を抽出する CLI",
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument(
        "--prd-file",
        type=str,
        help="PRD ファイルのパス（Markdown / テキスト）",
    )
    group.add_argument(
        "--prd",
        type=str,
        help="PRD テキストを直接渡す",
    )

    args = parser.parse_args()

    try:
        prd_text = _read_prd_text(args)
    except (FileNotFoundError, ValueError) as e:
        print(f"エラー: {e}", file=sys.stderr)
        return 1

    # API 呼び出しは時間がかかるので進捗を stderr に出す（標準出力は結果のみ）
    print(
        "分析中...（Planner → 並列 Agents → Reviewer のマルチエージェントパイプライン）",
        file=sys.stderr,
    )
    try:
        # analyze_prd() は async def（Agent Framework が非同期 API のため）。
        # CLI 自体は同期で動かしたいので、ここで asyncio.run() でラップする。
        # asyncio.run() はイベントループを 1 回作って関数を回し、終わったら閉じるヘルパ。
        result = asyncio.run(analyze_prd(prd_text))
    except RuntimeError as e:
        print(f"エラー: {e}", file=sys.stderr)
        return 1

    print(_format_result(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
