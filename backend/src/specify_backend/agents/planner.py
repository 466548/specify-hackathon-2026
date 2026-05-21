"""Planner Agent.

PRD を読んで、後段の 3 並列エージェント（Decision / EdgeCase / PastPRD）が何に注目すべきかの
分析計画を出力する。具体的な論点抽出はここでは行わない。
"""

from __future__ import annotations

from ..schemas import PLAN_SCHEMA
from ._client import build_chat_client

PLANNER_SYSTEM_PROMPT = """# システム定義

機能: PRD を読み、後段の 3 並列エージェント（Decision / EdgeCase / PastPRD）が何に注目すべきかの分析計画を作る
入力: PRD テキスト
出力: 分析計画（domain_summary / focus_areas / concerns_to_check_in_past_prds）

# ルール

- 抽出ではなく「計画」だけを出す。具体的論点はここでは挙げない
- domain_summary: PRD のドメインを 1 文で（例: 「中小企業向け勤怠管理 SaaS のユーザー追加機能」）
- focus_areas: 論点が集中しそうな観点を 3〜6 個（例: 「フォームバリデーション」「権限管理」「招待メール送信」）
- concerns_to_check_in_past_prds: 過去 PRD で確認すべき矛盾候補のキーワードを 2〜4 個
- 簡潔に。後段 Agent が読みやすい単語/短文ベース

# 横断観点の必須チェック（concerns_to_check_in_past_prds 用）

PRD が以下のいずれかを含む場合、表面的な機能名だけでなく**横断的な観点**も
concerns_to_check_in_past_prds に必ず含めること（過去 PRD で全社方針が
決まっている可能性が高い領域）:

- 追加 / 編集 / 削除など **書き込み操作**を含む
  → 「操作ログ・監査要件」を concerns に入れる
- 通知 / メール / Slack など **外部通知**を含む
  → 「通知チャネル・送信ポリシー」を concerns に入れる
- 権限 / 承認 / ロールなど **アクセス制御**を含む
  → 「権限境界・承認フロー」を concerns に入れる

機能特有の観点（例: 「ユーザー追加フロー」）に加えて、上記の横断観点を
**両方** concerns に並べる。

# 出力言語

すべて日本語で出力する。"""


def build_planner():
    """Planner Agent を構築して返す。

    クライアント生成は build_chat_client() に集約（env で OpenAI 公式 / Azure 切替）。
    default_options に response_format を埋め込んでおくと、ConcurrentBuilder 経由で
    agent.run(messages) と呼ばれた時にも Structured Outputs が効く。
    """
    return build_chat_client().as_agent(
        name="PlannerAgent",
        instructions=PLANNER_SYSTEM_PROMPT,
        default_options={"response_format": PLAN_SCHEMA},
    )
