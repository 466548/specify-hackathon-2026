"""Notion 連携の疎通＋取得結果ダンプスクリプト。

実装本体（specify_backend.notion.fetch_past_prds）をそのまま呼ぶので、
パイプラインで使われるロジックと完全に同じ経路を通る（独自実装で別の bug を生まない）。

確認できること:
  1. .env から NOTION_API_KEY / NOTION_PRD_DB_ID が読めるか
  2. Notion API への接続・認可が通るか
  3. PRD ページが取得できているか（Topics / 本文も含めて表示）
  4. 本文が Markdown ライクに整形されているか（見出しは `## `、リストは `- `）

使い方:
    cd backend
    uv run python scripts/notion_smoke.py

オプション:
    --full  本文を省略せず全文表示する（既定は先頭 20 行）
"""

from __future__ import annotations

import sys
from pathlib import Path

from dotenv import load_dotenv

# scripts/ は src/ の外なので、明示的にパスを通す。
# こうすると `python scripts/notion_smoke.py` でも `uv run` でも import が安定する。
_HERE = Path(__file__).resolve()
sys.path.insert(0, str(_HERE.parents[1] / "src"))

from specify_backend.notion import fetch_past_prds  # noqa: E402


def _load_env() -> None:
    """リポジトリルートの .env を読む（orchestrator と同じ階層計算）。"""
    repo_root = _HERE.parents[2]
    env_path = repo_root / ".env"
    if env_path.exists():
        load_dotenv(env_path, override=False)
        print(f"[load] {env_path}")


def _truncate(text: str, max_lines: int) -> tuple[str, int]:
    """本文を先頭 max_lines 行に切り詰める。残り行数も返す。"""
    lines = text.split("\n")
    if len(lines) <= max_lines:
        return text, 0
    return "\n".join(lines[:max_lines]), len(lines) - max_lines


def main(argv: list[str]) -> int:
    _load_env()

    full_mode = "--full" in argv

    past_prds, failure = fetch_past_prds()

    if failure:
        print(f"[FAIL] fetch_past_prds 失敗: {failure}")
        # 失敗コードごとに次にやるべきことを示唆
        hints = {
            "notion_api_key_missing": "→ .env に NOTION_API_KEY=secret_xxx を追加",
            "notion_db_id_missing": "→ .env に NOTION_PRD_DB_ID=xxx を追加",
            "notion_fetch_failed": "→ Integration を DB に Connect したか確認 / "
            "DB ID と Workspace が一致しているか確認",
        }
        if failure in hints:
            print(hints[failure])
        return 1

    print(f"[ok ] 取得件数: {len(past_prds)}")
    if not past_prds:
        print("[warn] 0 件です。Integration が DB に接続されているか、")
        print("       DB 配下に PRD ページがあるかを確認してください。")
        return 2

    print()
    print(f"--- PRD 一覧（本文は先頭 {'全文' if full_mode else '20 行'}）---")
    for i, prd in enumerate(past_prds, 1):
        print()
        print(f"[{i}] {prd.title}")
        print(f"    id     : {prd.id}")
        print(f"    topics : {', '.join(prd.topics) if prd.topics else '(なし)'}")
        print(f"    body   :")
        if not prd.body:
            print("        (本文なし)")
            continue
        body, remaining = (prd.body, 0) if full_mode else _truncate(prd.body, 20)
        for line in body.split("\n"):
            print(f"        {line}")
        if remaining > 0:
            print(f"        … （残り {remaining} 行は --full で表示）")

    print()
    print("[done] 疎通 OK。実装に進めます。")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
