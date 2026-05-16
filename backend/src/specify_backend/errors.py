"""エラー分類ヘルパー。

orchestrator で発生した例外を、フロント側で UI 分岐に使う 5 種類の error_type に
マッピングする。フロントは error_type を見て「再試行可」「最初に戻るのみ」を切り替える。

error_type は以下の 5 種類:
    - rate_limit       : OpenAI / Notion のレート制限。リトライ可能
    - timeout          : API タイムアウト・ネットワーク断。リトライ可能
    - auth             : API キーが無効 / 期限切れ。リトライ不能（設定要修正）
    - credit_exhausted : OpenAI 残高切れ / billing 制限。リトライ不能
    - unknown          : 上記いずれにも該当しない。リトライ可能（試して損なし）

retryable フラグも合わせて返す。フロントは error_type で表示テキスト、
retryable でボタン構成（「再試行」を出すかどうか）を決める。
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Literal


ErrorType = Literal["rate_limit", "timeout", "auth", "credit_exhausted", "unknown"]


@dataclass(frozen=True)
class ClassifiedError:
    """分類済みエラー情報。SSE の error イベントの data 部にそのまま乗せる。"""

    error_type: ErrorType
    retryable: bool
    """フロントで「再試行」ボタンを出すかどうかの判断材料。"""

    message: str
    """ユーザー向け文言。stack trace ではなく、何が起きて次に何をすべきかを 1 文で。"""


def classify_exception(exc: BaseException) -> ClassifiedError:
    """例外を ClassifiedError に変換する。

    OpenAI SDK の例外型を文字列で判定する（agent-framework-openai 経由のため、
    具体的な型を import すると依存が漏れるので避ける）。
    """
    # クラス名のフルパスで判定。OpenAI SDK の例外は openai.RateLimitError 等の
    # フォーマットで定義されている。
    exc_name = type(exc).__name__
    exc_module = type(exc).__module__
    fq_name = f"{exc_module}.{exc_name}"
    exc_msg = str(exc).lower()

    # --- 認証エラー（リトライ不能）---
    if exc_name in ("AuthenticationError",) or "authenticationerror" in fq_name.lower():
        return ClassifiedError(
            error_type="auth",
            retryable=False,
            message="API キーが無効、または期限切れです。.env を確認してください。",
        )

    # --- レート制限（リトライ可能、ただし credit_exhausted を内包することがある）---
    # OpenAI は credit 切れも RateLimitError として返すケースがある（429 status）。
    # message に "quota" / "billing" / "exceeded your" が含まれていたら credit と判定。
    if exc_name in ("RateLimitError",) or "ratelimiterror" in fq_name.lower():
        if any(kw in exc_msg for kw in ("quota", "billing", "exceeded your")):
            return ClassifiedError(
                error_type="credit_exhausted",
                retryable=False,
                message="API の利用枠を超えています。請求設定を確認してください。",
            )
        return ClassifiedError(
            error_type="rate_limit",
            retryable=True,
            message="API がレート制限中です。少し待ってから再試行してください。",
        )

    # --- タイムアウト（リトライ可能）---
    if (
        isinstance(exc, asyncio.TimeoutError)
        or exc_name in ("APITimeoutError", "Timeout", "TimeoutException")
        or "timeout" in fq_name.lower()
    ):
        return ClassifiedError(
            error_type="timeout",
            retryable=True,
            message="API がタイムアウトしました。ネットワークが不安定な可能性があります。",
        )

    # --- ネットワークエラー（リトライ可能）---
    # urllib3 / httpx / openai.APIConnectionError 等。
    if (
        exc_name
        in (
            "APIConnectionError",
            "ConnectionError",
            "NetworkError",
            "ProxyError",
        )
        or "connection" in fq_name.lower()
    ):
        return ClassifiedError(
            error_type="timeout",
            retryable=True,
            message="API への接続に失敗しました。ネットワークを確認してください。",
        )

    # --- credit_exhausted を直接示すエラー（保険）---
    if "insufficient_quota" in exc_msg or "you exceeded your current quota" in exc_msg:
        return ClassifiedError(
            error_type="credit_exhausted",
            retryable=False,
            message="API の利用枠を超えています。請求設定を確認してください。",
        )

    # --- それ以外は unknown ---
    return ClassifiedError(
        error_type="unknown",
        retryable=True,
        message=f"想定外のエラーが発生しました: {exc}",
    )
