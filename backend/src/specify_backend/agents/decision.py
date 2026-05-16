"""Decision Agent.

PRD から「UI/UX 系・データ表示系・ドメイン特有」の意思決定論点を抽出する。
異常系・エラー系は EdgeCase Agent に分担しているため、ここでは扱わない。
"""

from __future__ import annotations

from agent_framework.openai import OpenAIChatClient

from ..schemas import DECISION_SCHEMA

DECISION_SYSTEM_PROMPT = """# システム定義

機能: PRD から「UI/UX 系・データ表示系・ドメイン特有」の意思決定論点を抽出する
入力: 分析計画（Planner Agent からのヒント）+ PRD テキスト
出力: 構造化された意思決定論点リスト（呼び出し側の JSON Schema に準拠する dict）

# 抽出する観点（網羅的に検討すること）

## UI/UX 系
- バリデーションのタイミング（onChange / onBlur / onSubmit）
- Empty State（データが 0 件のときの表示）
- Loading 中の表示・操作可否
- 長文・大きな値の表示方法（折り返し / 省略 / 横スクロール）
- モバイル表示・レスポンシブ
- アクセシビリティ（キーボード操作、Tab キー順序、スクリーンリーダー、コントラスト）

## データ表示系
- デフォルト値・初期表示
- ソート順・並び順
- ページネーション・件数上限
- 空白文字・全角半角・大文字小文字の正規化

## ドメイン特有（業務系 SaaS なら必ず検討）
- 権限・ロール別の見え方（管理者 / 一般 / 退職者・休職者など特殊状態）
- 監査ログ・操作履歴
- 他機能・既存データとの整合性
- 業務慣習・関連法令への配慮
- 通知・メール送信の送信元、改ざん防止、再送可否

## その他
- i18n / 多言語対応
- 単位・タイムゾーンの扱い

# 各論点に付与するフィールド

- title: 論点名
- priority:
  - must（🔴必須・実装着手前に決まっていないと致命的）
  - should（🟡推奨・決まっていないと UX が劣化する）
  - nice（🟢任意・あとでも調整可能だが決めると洗練される）
- category: validation / empty_state / loading / domain / other
  - error / edge_case は EdgeCase Agent が扱うため、ここでは使わない
- options: 最低 3 つの具体的な選択肢（候補が 2 案しかない場合も、第 3 案として「該当なし」「保留」のような選択肢を必ず加える）
- rationale: なぜ決める必要があるか（1〜2 文）

# 件数・優先度の方針

- 件数は 6〜10 件を目標（後段の Reviewer で EdgeCase と統合される前提）
- 件数稼ぎの薄い論点（デザイントークン、コピーライティング細部など）は禁止
- nice 優先度の論点も通常 1〜2 件含まれるはず（i18n、アクセシビリティ、デフォルトのソート順など）
- PRD のドメインに特有の論点を必ず含める（例: 勤怠 SaaS なら、退職者扱い・管理職権限・監査ログ・既存 CSV 取込機能との整合性 など）
- 【必須】ユーザーの追加・削除・権限変更などアカウント管理系の操作を含む PRD では、
  「操作ログ・監査要件の有無」を category=domain の論点として必ず 1 件含めること。
  PRD に明記されていなくても論点として挙げる（記載漏れの指摘がこのエージェントの役割）。

# 出力言語

すべて日本語で出力する。"""


def build_decision_agent(model: str = "gpt-4o-mini"):
    """Decision Agent を構築して返す。"""
    return OpenAIChatClient(model=model).as_agent(
        name="DecisionAgent",
        instructions=DECISION_SYSTEM_PROMPT,
        default_options={"response_format": DECISION_SCHEMA},
    )
