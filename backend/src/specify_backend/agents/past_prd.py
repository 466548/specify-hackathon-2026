"""Past PRD Agent。

過去 PRD（Notion から取得済み）と新 PRD を照合し、矛盾候補を列挙する。
Week 4 で Notion 連携に移行し、過去 PRD は orchestrator 側で取得して
build_past_prd_agent() に注入する形にした（Week 3 のハードコードを撤廃）。

build 時の挙動:
  - past_prds が空 → 「矛盾検出を行わず contradictions: [] を返す」プロンプトで構築。
    これにより Notion 連携失敗時の縮退動作（contradictions が空でも処理が止まらない）が成立する。
  - past_prds が 1 件以上 → 通常の照合プロンプトを構築し、各 PRD を system prompt に展開。
"""

from __future__ import annotations

from agent_framework.openai import OpenAIChatClient

from ..notion import PastPRD
from ..schemas import CONTRADICTION_SCHEMA


def _past_prds_to_block(past_prds: list[PastPRD]) -> str:
    """過去 PRD 一覧を system prompt に埋め込むためのテキストに整形する。

    各 PRD は title / topics / body を持つ。LLM が読みやすいよう Markdown ライクに整形し、
    PRD 同士は --- で区切る。topics は concerns との突合ヒントとして並べる。
    """
    chunks: list[str] = []
    for prd in past_prds:
        topics_str = ", ".join(prd.topics) if prd.topics else "(なし)"
        # body はすでに Markdown ライクに整形済み（notion._block_to_text を参照）。
        chunks.append(
            f"### 過去 PRD: {prd.title}\n"
            f"- id: {prd.id}\n"
            f"- topics: {topics_str}\n\n"
            f"{prd.body}".rstrip()
        )
    return "\n\n---\n\n".join(chunks)


# 空リスト時に使う退避用プロンプト。
# Past PRD Agent をビルドしないという選択肢もあるが、ConcurrentBuilder の participants 構成を
# 変えずに済むよう、エージェント自体は存在させて空結果を返させる方針にする。
_EMPTY_SYSTEM_PROMPT = """# システム定義

機能: 過去 PRD との矛盾チェック（ただし今回は過去 PRD が取得できなかった）
入力: 分析計画 + 新 PRD
出力: contradictions: []

# ルール

過去 PRD のデータが提供されていない。
このため矛盾検出は行わず、必ず次の JSON をそのまま返す:

{
  "contradictions": []
}

# 出力言語

すべて日本語で出力する（ただし今回は空配列のみ）。"""


# 通常時の system prompt テンプレ。
# 過去 PRD のブロックと、concerns 活用ルールを差し込む。
_NORMAL_SYSTEM_PROMPT_TEMPLATE = """# システム定義

機能: 与えられた過去 PRD の本文と新 PRD を照合し、矛盾候補を抽出する
入力: 分析計画（Planner Agent からのヒント）+ 新 PRD テキスト
出力: 矛盾候補リスト（呼び出し側の JSON Schema に準拠する dict）

# 過去 PRD（KintaiKit ワークスペースの Notion DB から取得済み・{n_prds} 本）

以下の過去 PRD を必ず参照すること。各 PRD には Notion 上の topics タグも付いている。

{past_prds_block}

# 重点観点ヒントの使い方（重要）

入力テキストには Planner Agent からの「過去 PRD で確認すべきキーワード」
（concerns_to_check_in_past_prds）が含まれることがある。

これは **検索フィルタではなく重点観点ヒント** として扱う:
  - 過去 PRD はすでに全件 system prompt に展開済みなので、絞り込みには使わない
  - キーワードに関連しそうな過去 PRD の topics や本文セクション（特に
    「主要な決定事項」「監査・整合性」相当の見出し）を **優先的に深く読む**
  - キーワードに関連しない過去 PRD も無視せず、目を通すこと

# 引用元 PRD の選び方（重要）

concerns_to_check_in_past_prds で指摘された観点について矛盾を記述するときは、
以下のルールで「主たる引用元 PRD」を決める:

  - 同じ観点が複数の過去 PRD に登場する場合、**topics がその観点と一致する PRD**
    を主たる引用元として扱う
    （例: concerns が「監査ログとの整合性」なら topics に "audit" を持つ PRD が主）
  - 関連する内容が他の過去 PRD にもあれば、rationale 中で「他にも PRD-XXX で
    同様の記述あり」のように補足として言及してよい（無視はしない）
  - ただし past_prd_id および past_prd_quote には **主たる引用元 PRD のもの** を記載すること
    （補足側ではなく、観点と topics が直接一致する PRD を選ぶ）

# priority の意味（decisions と統一）

- must (🔴): 過去 PRD と直接矛盾、放置すると致命的
  - 例: 過去「管理職のみ申請可」⇔ 新 PRD「全員に適用」
- should (🟡): 過去 PRD で言及された事項が新 PRD で漏れている
  - 例: 過去「監査ログ必須」⇔ 新 PRD で言及なし
- nice (🟢): 関連はあるが必ずしも矛盾とは言えない注意点
  - 例: 過去 PRD で軽く言及されているが、新 PRD では別の文脈で扱っている

# 抽出ルール

- 過去 PRD の本文（特に「主要な決定事項」相当のセクション）と新 PRD の文面を照合し、
  上記 3 種類の不一致を見つける
- 不一致が無い場合は contradictions: [] を返す
- 各矛盾には以下を必ず含める:
  - title: 矛盾の概要（短く）
  - past_prd_id: 過去 PRD の id（Notion page id）
  - past_prd_quote: 過去 PRD からの引用（該当する 1〜2 文をそのまま）
  - new_prd_quote: 新 PRD からの引用、または「言及なし」
  - priority: must / should / nice
  - rationale: なぜそれが矛盾/漏れと判断したか（1〜2 文）

# 出力言語

すべて日本語で出力する。"""


def build_past_prd_agent(
    past_prds: list[PastPRD],
    model: str = "gpt-4o-mini",
):
    """Past PRD Agent を構築して返す。

    Args:
        past_prds: Notion から取得した過去 PRD のリスト。空リストでも OK
            （その場合は contradictions: [] を返す軽量プロンプトで構築）。
        model: モデル名（既定: gpt-4o-mini）。
    """
    if not past_prds:
        # 縮退モード: 過去 PRD なし → 空結果を返す Agent。
        instructions = _EMPTY_SYSTEM_PROMPT
    else:
        instructions = _NORMAL_SYSTEM_PROMPT_TEMPLATE.format(
            n_prds=len(past_prds),
            past_prds_block=_past_prds_to_block(past_prds),
        )

    return OpenAIChatClient(model=model).as_agent(
        name="PastPRDAgent",
        instructions=instructions,
        default_options={"response_format": CONTRADICTION_SCHEMA},
    )
