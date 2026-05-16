"""Backwards-compat 薄いラッパ。

Week 1〜2 では本体実装がここにあったが、Week 3 のマルチエージェント化に伴い、
実体は orchestrator.py に移った。`analyze_prd` という関数名は cli.py 等の呼び出し側との
互換性のために残してある。
"""

from __future__ import annotations

from typing import Any

from .orchestrator import run_pipeline


async def analyze_prd(prd_text: str) -> dict[str, Any]:
    """PRD を解析して、意思決定論点 + 過去 PRD 矛盾を返す。

    実体は orchestrator.run_pipeline。Planner → 並列 Agents → Reviewer の
    マルチエージェントパイプラインを動かす。
    """
    return await run_pipeline(prd_text)
