"""Notion 連携クライアント。

KintaiKit の過去 PRD（Notion DB 配下のページ）を取得して Past PRD Agent に渡す。
ベストエフォート方針:
  - 取得失敗時はパイプラインを止めず、空リスト + 失敗コードを返す
  - 失敗コードは aggregator 経由で meta.failed_agents に積まれ、
    「縮退動作中」であることが API レスポンスから判別できるようにする

公開 API:
  - PastPRD: 取得結果を表す dataclass
  - fetch_past_prds(): (list[PastPRD], failure_code | None) を返す

failure_code 一覧:
  - "notion_api_key_missing"  : NOTION_API_KEY が .env にない
  - "notion_db_id_missing"    : NOTION_PRD_DB_ID が .env にない
  - "notion_fetch_failed"     : API 呼び出しで例外が出た（通信エラー / 認可エラー等）
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field

# notion-client は内部で httpx を使う公式系クライアント。
# ここでは synchronous Client のみ使用（Agent Framework は async だが、
# Notion 呼び出しはパイプライン冒頭の 1 回のみで、I/O 量も小さいため同期で十分）。
from notion_client import Client
from notion_client.errors import APIResponseError, HTTPResponseError, RequestTimeoutError


@dataclass(frozen=True)
class PastPRD:
    """Notion から取得した過去 PRD 1 件。

    body は Markdown ライクな文字列に整形済み（見出しは `## `、リスト項目は `- `）。
    LLM が「主要な決定事項」セクションを優先的に読めるよう、最低限の構造を保持する。
    """

    id: str
    """Notion page id（uuid 形式）。デモでは URL 末尾にも出るため、追跡用に保持。"""

    title: str
    """Name プロパティの値（例: "PRD-2025-Q3-leave"）。"""

    topics: list[str] = field(default_factory=list)
    """Topics multi-select の値（例: ["leave", "notification"]）。"""

    body: str = ""
    """ページ本文を Markdown ライクに整形した文字列。"""


# ---------------------------------------------------------------------------
# Notion プロパティ抽出ヘルパー
# ---------------------------------------------------------------------------


def _prop_title(props: dict, name: str) -> str:
    """Title プロパティの plain text を取り出す。"""
    p = props.get(name) or {}
    segs = p.get("title") or []
    return "".join(seg.get("plain_text", "") for seg in segs)


def _prop_multi_select(props: dict, name: str) -> list[str]:
    """Multi-select プロパティの値リストを取り出す。"""
    p = props.get(name) or {}
    return [opt.get("name", "") for opt in (p.get("multi_select") or [])]


# ---------------------------------------------------------------------------
# Notion block → Markdown ライク テキスト変換
# ---------------------------------------------------------------------------

# 取り扱う block type と整形プレフィクスの対応表。
# 未対応 type（callout / toggle / table など）はとりあえず plain text のみ取り出す。
_BLOCK_PREFIX: dict[str, str] = {
    "heading_1": "# ",
    "heading_2": "## ",
    "heading_3": "### ",
    "bulleted_list_item": "- ",
    "numbered_list_item": "1. ",  # 番号の連番は崩すが、LLM 読解上は問題ない
    "quote": "> ",
    "to_do": "- [ ] ",
    "paragraph": "",
}


def _rich_text_to_plain(rich_text: list[dict]) -> str:
    """rich_text 配列を plain text に flatten する。"""
    return "".join(seg.get("plain_text", "") for seg in (rich_text or []))


def _block_to_text(block: dict) -> str:
    """1 つの block を整形済み 1 行（または空文字）に変換する。"""
    btype = block.get("type", "")
    payload = block.get(btype, {})

    # 多くの block は payload["rich_text"] にテキストを持つ。
    rich = payload.get("rich_text") if isinstance(payload, dict) else None
    if rich is None:
        # divider / image / code 等。code は本文に含めたいので別扱い。
        if btype == "code":
            text = _rich_text_to_plain(payload.get("rich_text", []))
            lang = payload.get("language", "")
            return f"```{lang}\n{text}\n```"
        if btype == "divider":
            return "---"
        # その他は無視
        return ""

    text = _rich_text_to_plain(rich)
    prefix = _BLOCK_PREFIX.get(btype, "")
    if not text and not prefix:
        return ""
    return f"{prefix}{text}".rstrip()


def _fetch_page_body(client: Client, page_id: str) -> str:
    """ページ配下の block を全件取得して Markdown ライクなテキストに整形。

    ページャは notion-client の iterate_paginated_api を使わず、シンプルに
    has_more を見て start_cursor を回す。ネストは追わない（トップレベルのみ）。
    """
    lines: list[str] = []
    cursor: str | None = None
    while True:
        resp = client.blocks.children.list(
            block_id=page_id,
            page_size=100,
            start_cursor=cursor,
        )
        # 公式 SDK のレスポンスは dict ライクなのでそのまま添字アクセスできる。
        for block in resp.get("results", []):
            line = _block_to_text(block)
            if line:
                lines.append(line)
        if not resp.get("has_more"):
            break
        cursor = resp.get("next_cursor")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# メイン: 過去 PRD 取得
# ---------------------------------------------------------------------------


def fetch_past_prds() -> tuple[list[PastPRD], str | None]:
    """Notion から過去 PRD 一覧を取得する。

    Returns:
        (past_prds, failure_code)
            past_prds: 取得できた PRD のリスト（失敗時は空リスト）
            failure_code: 失敗理由のコード文字列（成功時は None）

    Note:
        例外は外に漏らさない。すべて failure_code として返す（ベストエフォート方針）。
        呼び出し側は failure_code をそのまま meta.failed_agents に積む想定。
    """
    api_key = os.environ.get("NOTION_API_KEY")
    db_id = os.environ.get("NOTION_PRD_DB_ID")

    if not api_key:
        print(
            "⚠️  NOTION_API_KEY が未設定。Past PRD 取得をスキップします。",
            file=sys.stderr,
        )
        return [], "notion_api_key_missing"
    if not db_id:
        print(
            "⚠️  NOTION_PRD_DB_ID が未設定。Past PRD 取得をスキップします。",
            file=sys.stderr,
        )
        return [], "notion_db_id_missing"

    try:
        client = Client(auth=api_key)
        # Notion API v2025（notion-client 3.x）では "data sources" の概念が入り、
        # 旧 databases.query は data_sources.query に移った。
        # 1 つのデータベースは 1 個以上の data_source を持つが、
        # UI で普通に作った DB は 1:1 なので先頭を使う。
        db_meta = client.databases.retrieve(database_id=db_id)
        data_sources = db_meta.get("data_sources") or []
        if not data_sources:
            print(
                f"⚠️  DB {db_id} に data_source が見つかりません",
                file=sys.stderr,
            )
            return [], "notion_fetch_failed"
        data_source_id = data_sources[0]["id"]
        # page_size 上限 100、デモ規模では十分。
        result = client.data_sources.query(
            data_source_id=data_source_id, page_size=100
        )
    except (APIResponseError, HTTPResponseError, RequestTimeoutError) as e:
        # 認可エラー / 通信エラー / タイムアウト等の Notion SDK 既知例外。
        print(f"⚠️  Notion API 呼び出しに失敗: {e}", file=sys.stderr)
        return [], "notion_fetch_failed"
    except Exception as e:
        # 想定外の例外も握って続行（ベストエフォート方針）。
        print(f"⚠️  Notion 連携で想定外の例外: {e}", file=sys.stderr)
        return [], "notion_fetch_failed"

    pages = result.get("results", [])
    past_prds: list[PastPRD] = []
    for page in pages:
        page_id = page.get("id", "")
        props = page.get("properties", {}) or {}
        title = _prop_title(props, "Name") or "(untitled)"
        topics = _prop_multi_select(props, "Topics")

        # 本文取得もページ単位で失敗しうるので個別に try/except。
        # 1 ページが落ちても残りは活かす。
        try:
            body = _fetch_page_body(client, page_id)
        except Exception as e:
            print(
                f"⚠️  本文取得に失敗（page_id={page_id[:8]}...）: {e}",
                file=sys.stderr,
            )
            body = ""

        past_prds.append(
            PastPRD(id=page_id, title=title, topics=topics, body=body)
        )

    print(
        f"📚 Notion から過去 PRD を {len(past_prds)} 件取得",
        file=sys.stderr,
    )
    return past_prds, None
