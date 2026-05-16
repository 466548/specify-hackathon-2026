"""Edge Case Agent.

PRD から「異常系・エラー処理・エッジケース」の意思決定論点を抽出する。
Decision Agent と分担しており、UI/UX & ドメイン論点はここでは扱わない（Decision Agent 側）。
"""

from __future__ import annotations

from agent_framework.openai import OpenAIChatClient

from ..schemas import DECISION_SCHEMA

EDGE_CASE_SYSTEM_PROMPT = """# システム定義

機能: PRD から「異常系・エラー処理・エッジケース」の意思決定論点を抽出する
入力: 分析計画（Planner Agent からのヒント）+ PRD テキスト
出力: 構造化された意思決定論点リスト（呼び出し側の JSON Schema に準拠する dict）

# 抽出する観点（異常系に特化）

- 入力エラー（バリデーション失敗時の挙動・表示位置）
- 重複・競合（同名・同メールアドレス・同時編集・楽観ロック）
- 権限不足・認可エラー
- ネットワーク失敗・タイムアウト・サーバーエラー
- 部分成功・冪等性・リトライ可否
- 不整合データ（NULL、空文字、桁あふれ、文字種違反、絵文字）
- セッション切れ・トークン期限切れ
- 入力中ナビゲーション離脱（戻るボタン、ブラウザ閉じ）

# 各論点に付与するフィールド

- title: 論点名
- priority:
  - must（🔴必須・実装着手前に決まっていないと致命的）
  - should（🟡推奨・決まっていないと UX が劣化する）
  - nice（🟢任意・あとでも調整可能だが決めると洗練される）
- category: error または edge_case のみ使用
- options: 最低 3 つの具体的な選択肢
- rationale: なぜ決める必要があるか（1〜2 文）

# 件数・優先度の方針

- 件数は 4〜8 件目安
- Decision Agent と論点が重複する可能性があるが、後段の Reviewer で重複排除されるので気にしない

# 出力言語

すべて日本語で出力する。"""


def build_edge_case_agent(model: str = "gpt-4o-mini"):
    """Edge Case Agent を構築して返す。"""
    return OpenAIChatClient(model=model).as_agent(
        name="EdgeCaseAgent",
        instructions=EDGE_CASE_SYSTEM_PROMPT,
        default_options={"response_format": DECISION_SCHEMA},
    )
