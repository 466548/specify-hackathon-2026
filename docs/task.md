# Week 1 - Hello World ステップ

CLAUDE.md を読んでから着手してください。

## このタスクのゴール

ローカルで以下が動く状態にする:

> **PRD テキストをコマンドラインから投げると、OpenAI API が「未定義の意思決定の論点リスト」を JSON で返してくる**

CLI 1 本で完結。Web サーバーも UI もまだ作らない。

## やらないこと（明確に範囲外）

- Microsoft Agent Framework は使わない（**素の openai SDK のみ**で書く。Agent Framework は次のステップ）
- マルチエージェントにしない（1 関数で完結）
- FastAPI / Web サーバー作らない（CLI のみ）
- Notion 連携しない
- フロントエンド触らない

## 作業手順

実装前に、まず以下の手順で「これから何を作るか」のリストを出してください。
私が「OK」と言ってから着手してください。

### Step 1: 環境チェック

以下を確認:
- `uv` がインストールされているか（`uv --version`）
- ない場合はインストールコマンドを提示するだけ。**実行はしない**

### Step 2: backend/ で依存解決

backend/ に移動して以下を実行する想定（コマンドの提示まで。実行は私が判断）:

```bash
cd backend
uv sync
```

ただし `pyproject.toml` の現在の依存リストを再確認し、Hello World 段階では以下だけで十分なはずです:
- `openai`
- `python-dotenv`

`microsoft-agent-framework` は次のステップで使うので、**残しておいても OK だが今は import しない**。

### Step 3: .env を作る

`.env.example` を `.env` にコピーして、`OPENAI_API_KEY` だけ埋める想定であることを確認してください（実際の鍵は私が手で書く）。

### Step 4: Decision Agent の最小実装

`backend/src/specify_backend/decision_agent.py` を新規作成。

仕様:
- 関数 1 つ: `analyze_prd(prd_text: str) -> dict`
- 中身は OpenAI Chat Completions API（`gpt-4o-mini`）を 1 回叩く
- システムプロンプトで「PRD を読んで、まだ決まっていない意思決定を JSON 形式で列挙する」役割を与える
- レスポンスは構造化出力（Structured Outputs / `response_format` で JSON Schema 指定）で受ける
- 戻り値の dict 構造案:

```python
{
    "summary": "PRD から検出した機能の概要を 1〜2 文で",
    "decisions": [
        {
            "title": "バリデーションタイミング",
            "priority": "must" | "should" | "nice",
            "category": "validation" | "empty_state" | "loading" | "error" | "edge_case" | "other",
            "options": ["onChange", "onBlur", "onSubmit"],
            "rationale": "なぜ決める必要があるか"
        }
    ]
}
```

実装上の配慮:
- 型ヒントを必ずつける（`list[dict]`, `Literal[...]` など）
- 主要な処理にコメントを添える（Python 不慣れな読み手向け）
- `python-dotenv` で `.env` を読み込む
- `OPENAI_API_KEY` がないときは明示的に `RuntimeError` を投げる
- async ではなく**同期関数**で書く（Hello World 段階なので簡単に）

### Step 5: CLI エントリポイント

`backend/src/specify_backend/cli.py` を新規作成。

仕様:
- 引数で PRD テキストを受け取る方法を 2 通り用意:
  1. `--prd-file path/to/prd.md` でファイル読み込み
  2. `--prd "PRDテキスト"` で直接渡す
- `analyze_prd()` を呼んで結果を整形して標準出力に表示
- 表示形式: 人間が読みやすい形（JSON ダンプではなく、優先度ごとに見出しを付けてリスト表示）

`pyproject.toml` の `[project.scripts]` に登録:

```toml
[project.scripts]
specify = "specify_backend.cli:main"
```

これで `uv run specify --prd-file demo-data/sample-prd.md` で実行できる。

### Step 6: サンプル PRD を 1 本用意

`demo-data/sample-prd.md` を新規作成。

内容: 架空 SaaS「KintaiKit」の「ユーザー追加モーダル機能」の PRD。
**意図的に未定義箇所を仕込む**。例:
- フォームのバリデーションタイミング未記載
- エラー時の UI 未記載
- 重複メールアドレス時の挙動未記載
- 長文入力時の表示未記載

400〜600 字程度。Markdown で書く。

### Step 7: 動作確認手順

最後に、私が手で実行する確認コマンドを README に追記、または手順をチャットで提示してください。

```bash
cd backend
uv run specify --prd-file ../demo-data/sample-prd.md
```

期待される出力: 優先度付きで意思決定論点が 5〜10 件並ぶ。

---

## 実装上の制約（再掲）

- 計画リストを出してから着手。OK と言うまでファイル変更しない
- パッケージのインストール（`uv sync`, `npm install` 等）は私が手で実行する。エージェントは**コマンドの提示まで**
- 不要なライブラリは入れない
- Python は型ヒント必須、async は使わない（同期）
- Microsoft Agent Framework は import しない（次のステップ）

## 質問があれば先に出してください

着手前に不明点があれば、計画リストと一緒に質問してください。