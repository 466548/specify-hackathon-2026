"""Chat client ヘルパー。OpenAI 公式 / Azure OpenAI を env 自動検出で切替える。

切替ルール:
  - AZURE_OPENAI_ENDPOINT が設定されていれば → Azure OpenAI 経由
  - それ以外（fallback） → OpenAI 公式

ハッカソン要件「Microsoft AI 技術の利用」のため Azure OpenAI を本番採用するが、
quota 承認待ちの期間も既存デモを動かしたいので dual-support にしてある。
"""

from __future__ import annotations

import os

from agent_framework.openai import OpenAIChatClient


def build_chat_client() -> OpenAIChatClient:
    """OpenAIChatClient を環境変数から構築する。

    AZURE_OPENAI_ENDPOINT があれば Azure 経由、なければ OpenAI 公式。
    どちらのケースも model 名はそれぞれの env から決定する:
      - Azure: AZURE_OPENAI_DEPLOYMENT_NAME (デプロイメント名)
      - 公式 : OPENAI_MODEL (省略時は gpt-4o-mini)
    """
    azure_endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT")
    if azure_endpoint:
        return OpenAIChatClient(
            model=os.environ["AZURE_OPENAI_DEPLOYMENT_NAME"],
            azure_endpoint=azure_endpoint,
            api_key=os.environ["AZURE_OPENAI_API_KEY"],
            api_version=os.environ.get("AZURE_OPENAI_API_VERSION"),
        )
    return OpenAIChatClient(model=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"))
