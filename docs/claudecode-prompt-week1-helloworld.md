# Claude Code 作業指示: Week 1 - Hello World ステップ

`@CLAUDE.md` を必ず先に読んでから着手してください。

## このタスクのゴール

ローカルで以下が動く状態にする:

> **PRD テキストをコマンドラインから投げると、OpenAI API が「未定義の意思決定の論点リスト」を JSON で返してくる**

CLI 1 本で完結。Web サーバーも UI もまだ作らない。

## 範囲外(やらないこと)

- Microsoft Agent Framework は使わない(**素の openai SDK のみ**で書く。Agent Framework は次のステップ)
- マルチエージェントにしない(1 関数で完結)
- FastAPI / Web サーバー作らない(CLI のみ)
- Notion 連携しない
- フロントエンド触らない
- `pyproject.toml` の変更(既に必要な依存と `[project.scripts]` 登録済み)
- `.env.example` の変更(既に `OPENAI_API_KEY` の行あり)

## 事前確認済み事項(調査不要)

以下は既に確認済みです。再調査しないでください:

- `backend/pyproject.toml` に `openai`、`python-dotenv`、`microsoft-agent-framework` が登録済み
- `backend/pyproject.toml` の `[project.scripts]` に `specify = "specify_backend.cli:main"` が登録済み
- `backend/.env.example` に `OPENAI_API_KEY=` の行が存在
- 依存追加は不要、`uv sync` のみで OK

## 確定した設計判断

| 項目 | 決定 |
|---|---|
| CLI 引数パーサー | `argparse`(標準ライブラリ) |
| モデル名 | `gpt-4o-mini` |
| Structured Outputs 実装 | `response_format={"type": "json_schema", ...}` を使う。**Pydantic は使わない**(依存追加禁止) |
| 整形出力スタイル | 絵文字付き(🔴必須 / 🟡推奨 / 🟢任意)、priority の英語値を日本語ラベルに変換 |
| JSON Schema 制約 | `priority` は enum `["must", "should", "nice"]`、`category` は enum `["validation", "empty_state", "loading", "error", "edge_case", "other"]` |
| 同期/非同期 | **同期関数**(async は使わない) |

## 実装上の制約(再掲)

- **計画リストを出してから着手。「OK」と言うまでファイル変更しない**
- パッケージのインストール(`uv sync`、`npm install` 等)はユーザーが手で実行する。エージェントは**コマンドの提示まで**
- 不要なライブラリは入れない
- Python は型ヒント必須、async は使わない(同期)
- Microsoft Agent Framework は import しない(次のステップ)
- ユーザーは Python 不慣れ。コメント密度はコード行数の **30〜50%** を目安に、「なぜそう書くか」を添える

## 作業手順

### Step 1: 環境チェック(コマンド提示のみ)

`uv --version` の確認コマンドを提示。未インストールならインストールコマンド(`curl -LsSf https://astral.sh/uv/install.sh | sh`)を提示するだけ。**実行はしない**。

### Step 2: 依存解決(コマンド提示のみ)

```bash
cd backend
uv sync
```
を提示するだけ。**実行はしない**。

### Step 3: `.env` 作成(コマンド提示のみ)

```bash
cd backend
cp .env.example .env
```
を提示するだけ。`.env` の `OPENAI_API_KEY=...` は**ユーザーが手で書く**。**実行はしない**。

### Step 4: `backend/src/specify_backend/decision_agent.py` 新規作成

仕様:

- 関数 1 つ: `analyze_prd(prd_text: str) -> dict`
- 中身は OpenAI Chat Completions API(`gpt-4o-mini`)を 1 回叩く
- システムプロンプトで「PRD を読んで、まだ決まっていない意思決定を JSON 形式で列挙する」役割を与える
- レスポンスは Structured Outputs(`response_format={"type": "json_schema", "json_schema": {...}}`)で受ける
- 戻り値の dict 構造:

```python
{
    "summary": "PRD から検出した機能の概要を 1〜2 文で",
    "decisions": [
        {
            "title": "バリデーションタイミング",
            "priority": "must",  # "must" | "should" | "nice"
            "category": "validation",  # "validation" | "empty_state" | "loading" | "error" | "edge_case" | "other"
            "options": ["onChange", "onBlur", "onSubmit"],
            "rationale": "なぜ決める必要があるか"
        }
    ]
}
```

実装上の配慮:

- 型ヒントを必ずつける(`list[dict]`、`Literal[...]` など)
- `python-dotenv` の `load_dotenv()` で `.env` を読み込む
- `OPENAI_API_KEY` が無い場合は明示的に `RuntimeError` を投げる
- async ではなく**同期関数**で書く
- JSON Schema の `priority`・`category` は enum で厳格に縛る
- JSON Schema は `"strict": true` を指定する
- システムプロンプトでは CLAUDE.md の「対象論点の例」(バリデーションタイミング / Empty State / Loading / Error / 長文表示 / 権限別 / モバイル / 空配列 / ソート順 / ページネーション / i18n / アクセシビリティ)を参考論点として渡す
- コメントは Python 不慣れな読み手向けに「なぜそう書くか」を添える(密度 30〜50%)

### Step 5: `backend/src/specify_backend/cli.py` 新規作成

仕様:

- `argparse` で引数を受ける。以下 2 通りを排他で:
  1. `--prd-file path/to/prd.md` でファイル読み込み
  2. `--prd "PRDテキスト"` で直接渡す
- どちらか必須(`add_mutually_exclusive_group(required=True)`)
- `analyze_prd()` を呼んで結果を整形して標準出力に表示
- 表示形式: 優先度ごとに見出しを付けて整形(JSON ダンプではない)。具体例:

```
📋 概要
<summary>

🔴 必須 (3件)
  1. バリデーションタイミング [validation]
     選択肢: onChange / onBlur / onSubmit
     根拠: <rationale>
  ...

🟡 推奨 (2件)
  ...

🟢 任意 (1件)
  ...
```

- `main()` 関数を定義(`pyproject.toml` の `[project.scripts]` から呼ばれる)
- `priority` の英語値(`must` / `should` / `nice`)は日本語ラベル(必須 / 推奨 / 任意)に変換して表示
- 空のセクション(0件)は出力しない
- `--prd-file` で指定されたパスが存在しない場合は分かりやすいエラーメッセージで終了

### Step 6: `demo-data/sample-prd.md` 新規作成

内容: 架空 SaaS「KintaiKit」(中小企業向け勤怠管理 SaaS)の「ユーザー追加モーダル機能」の PRD。

要件:

- 400〜600 字程度、Markdown
- 機能概要・操作フローは書く
- **意図的に未定義箇所を仕込む**(以下を最低含む):
  - フォームのバリデーションタイミング未記載
  - エラー時の UI 未記載
  - 重複メールアドレス時の挙動未記載
  - 30 文字超の名前(長文入力)時の表示未記載

### Step 7: 動作確認手順を提示

実装完了後、以下のコマンドをチャットで提示。**実行はユーザーが手でやる**:

```bash
cd backend
uv run specify --prd-file ../demo-data/sample-prd.md
```

期待される出力: 優先度付きで意思決定論点が 5〜10 件並ぶ。

---

## 変更予定ファイル(これ以外は触らない)

| ファイル | 操作 |
|---|---|
| `backend/src/specify_backend/decision_agent.py` | 新規作成 |
| `backend/src/specify_backend/cli.py` | 新規作成 |
| `demo-data/sample-prd.md` | 新規作成 |

`backend/pyproject.toml` と `backend/.env.example` は**変更しない**。

---

## 着手前にやること

1. `@CLAUDE.md` を読む
2. 上記の確定設計と整合する形で、ファイルごとの実装方針(関数名・主要な処理の流れ・JSON Schema の概形)を箇条書きで提示する
3. 不明点があれば質問する
4. ユーザーの「OK」を待ってからファイル作成に着手する

**OK と言われるまでファイル変更禁止です。**
