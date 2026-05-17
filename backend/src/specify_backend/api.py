"""Specify バックエンドの HTTP API（FastAPI）。

Week 5 で導入。フロント（Next.js）から PRD を POST し、
分析結果を返す。Step 1 では sync 用の 1 本のみ。SSE 版は Step 4 で追加する。

エンドポイント:
  - POST /api/analyze/sync  : run_pipeline() の結果を JSON 一括返却
  - POST /api/analyze       : (Step 4 で追加) SSE で進捗を逐次配信

起動:
  uv run specify-api   # 内部で uvicorn を呼ぶ
"""

from __future__ import annotations

import json
from typing import Any, AsyncIterator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from .errors import classify_exception
from .orchestrator import ProgressEvent, run_pipeline, run_pipeline_streaming

# PRD の最大サイズ（バイト）。とりあえず 500KB。ハッカソンデモなら十分。
# 超過時は 413 Payload Too Large を返す。
_MAX_PRD_BYTES = 500 * 1024


# FastAPI app をモジュールトップで構築。uvicorn から import 文字列
# `specify_backend.api:app` で参照されるためトップ階層に置く必要がある。
app = FastAPI(
    title="Specify API",
    description="PRD から未定義の意思決定論点を炙り出すマルチエージェント API",
    version="0.1.0",
)

# CORS: 開発時のフロント（localhost:3000）からのみ叩けるようにする。
# 本番デプロイ時（Week 6）にオリジンを追加する。
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=False,
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    """POST /api/analyze* のリクエストボディ。

    Pydantic で validation。空文字や JSON 構造の不正は FastAPI が自動で 422 を返す。
    """

    # Field の min_length=1 で空 PRD を弾く。max_length は別途バイト数でチェック（マルチバイト対策）。
    prd_text: str = Field(..., min_length=1, description="PRD のテキスト（Markdown 可）")


def _validate_size(prd_text: str) -> None:
    """PRD のバイト数チェック。超過時は 413 を投げる。"""
    if len(prd_text.encode("utf-8")) > _MAX_PRD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"PRD が大きすぎます（上限 {_MAX_PRD_BYTES // 1024}KB）",
        )


@app.get("/api/health")
async def health() -> dict[str, str]:
    """疎通用のヘルスチェック。デプロイ時のヘルスチェックにも使う。"""
    return {"status": "ok"}


@app.post("/api/analyze/sync")
async def analyze_sync(req: AnalyzeRequest) -> dict[str, Any]:
    """PRD を解析して結果を JSON 一括返却する。

    SSE 不要な疎通確認・テスト・縮退動作の手動チェック用。Week 5 Step 1 で導入。
    フロントが本番で叩くのは SSE 版（Step 4 追加の `/api/analyze`）になる予定だが、
    このエンドポイントは MVP 完成後も「JSON で結果が見たい」ケースのため残す。

    Args:
        req: AnalyzeRequest（prd_text のみ）

    Returns:
        run_pipeline() の戻り値 dict（summary / decisions / contradictions / meta）
    """
    _validate_size(req.prd_text)

    try:
        # run_pipeline は async 関数なので await。
        # Week 5 Step 3 以降は内部で streaming 版を回す薄ラッパになるが、
        # 戻り値の構造は変えない。
        result = await run_pipeline(req.prd_text)
    except RuntimeError as e:
        # OPENAI_API_KEY 未設定など、回復不能なエラーは 500 を返す。
        # Notion 取得失敗等の縮退可能エラーは run_pipeline 内で握って result.meta に積まれる。
        raise HTTPException(status_code=500, detail=str(e)) from e

    return result


# ---------------------------------------------------------------------------
# SSE エンドポイント
# ---------------------------------------------------------------------------


def _to_sse_message(ev: ProgressEvent) -> dict[str, str]:
    """ProgressEvent を sse-starlette が受け取る dict 形式に変換する。

    sse-starlette の generator は `{"event": str, "data": str, "id": str?, "retry": int?}`
    を受け取る。複数行の data は sse-starlette が自動で `data:` 行を複数に分割するが、
    日本語の改行を含む文字列は JSON に潰してしまうほうが扱いやすい。

    フロント側は `event` 名で個別ハンドラを呼び、`data` を JSON.parse して
    `{message, data}` を取り出す。
    """
    payload = {"message": ev.message, "data": ev.data}
    return {
        "event": ev.type,
        "data": json.dumps(payload, ensure_ascii=False),
    }


async def _event_generator(prd_text: str) -> AsyncIterator[dict[str, str]]:
    """run_pipeline_streaming() の ProgressEvent を SSE 形式に変換して逐次 yield。

    sse-starlette は generator 終了で自動的に SSE ストリームを close する。
    例外は run_pipeline_streaming() 内で握って ProgressEvent(type="error") に変換されるが、
    念のためここでも try/except で包んで保険をかける。
    """
    try:
        async for ev in run_pipeline_streaming(prd_text):
            yield _to_sse_message(ev)
    except Exception as e:
        # run_pipeline_streaming が予期せぬ例外を漏らした場合の最後の砦。
        # classify_exception で UI 分岐用の error_type / retryable を付ける。
        classified = classify_exception(e)
        yield {
            "event": "error",
            "data": json.dumps(
                {
                    "message": classified.message,
                    "data": {
                        "error_type": classified.error_type,
                        "retryable": classified.retryable,
                    },
                },
                ensure_ascii=False,
            ),
        }


@app.post("/api/analyze")
async def analyze(req: AnalyzeRequest) -> EventSourceResponse:
    """PRD を解析し、進捗を SSE で逐次配信する。

    送信される event は以下:
        - planner_started / planner_completed
        - notion_fetch_started / notion_fetch_completed
        - workflow_started
        - executor_invoked / executor_completed  (data.executor_id)
        - output   (data に Result 全体 = {summary, decisions, contradictions, meta})
        - error    (data.message にエラーメッセージ)

    ping=15 で 15 秒ごとに heartbeat コメントを送る（プロキシのアイドル切断対策）。
    クライアントが abort（unmount）したら generator は自然に GC される。
    """
    _validate_size(req.prd_text)
    return EventSourceResponse(_event_generator(req.prd_text), ping=15)


def run() -> None:
    """`uv run specify-api` から呼ばれるエントリ。

    開発用なので reload=True（コード変更で自動再起動）。
    本番デプロイ時（Week 6）は別の起動方法（gunicorn + uvicorn worker など）を検討する。
    """
    import uvicorn

    uvicorn.run(
        "specify_backend.api:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
