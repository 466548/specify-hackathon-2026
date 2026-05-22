# Specify 仕様書（2026-05-22 時点）

Microsoft Agent Hackathon 2026 提出版の現状仕様をまとめたドキュメント。
方針・スケジュールは [`CLAUDE.md`](./CLAUDE.md) を参照。

---

## 1. プロダクト概要

**PRD（製品要求仕様書）から「決まっていない意思決定」を体系的に炙り出すマルチエージェント。**

- 仕様書を 5 つのエージェントで並列分析し、未決定の論点 + 過去仕様書との矛盾を抽出する
- 出力には選択肢と判定理由が付くので、議論のたたき台や ADR 下書きにそのまま使える
- 想定利用シーン: 仕様書レビュー直前の自己点検

---

## 2. 主要機能

| 機能 | 概要 | 主担当 Agent |
|---|---|---|
| 意思決定リスト生成 | UI/UX、データ表示、ドメイン特有の未決定論点を抽出 | Decision Agent |
| 異常系・エッジケース抽出 | 連続クリック、二重送信、権限境界などの抜けを検出 | EdgeCase Agent |
| 過去 PRD 矛盾検出 | Notion 上の過去仕様書と新仕様書の矛盾を抽出 | Past PRD Agent |
| 統合 + 優先度補正 + 論点補完 | 並列出力を統合、重複排除、過去矛盾を新規 decision として補完 | Reviewer Agent |
| 軽量画面プレビュー | 決定結果に応じた状態（Default/Empty/Loading/Error/LongText）を可視化 | frontend 静的実装 |
| Markdown / Notion エクスポート | 確定後の決定リストを Markdown でダウンロード or クリップボードコピー | frontend |

---

## 3. アーキテクチャ

### 3.1 エージェント構成

```
[Planner Agent]   PRD の概要把握 + 後続が注目すべき観点を整理
       │
       ▼  ConcurrentBuilder（並列実行）
┌───────────────┬───────────────┬───────────────┐
│ Decision Agent│ EdgeCase Agent│ Past PRD Agent│
│ UI/UX・ドメイン│ 異常系・状態  │ 過去仕様取得  │
└───────┬───────┴───────┬───────┴───────┬───────┘
        │               │               │
        ▼               ▼               ▼
              [Reviewer Agent]
              統合・重複排除・優先度調整・論点補完
                      │
                      ▼
        意思決定論点リスト + 過去仕様書との矛盾
```

実装は `backend/src/specify_backend/orchestrator.py` で Planner を 1 回呼んだあと `ConcurrentBuilder` で 3 並列実行 → `with_aggregator(reviewer_aggregator)` で統合。

### 3.2 技術スタック

| レイヤー | 採用 |
|---|---|
| Frontend | Next.js 16（App Router）+ TypeScript |
| Backend | Python 3.12 + FastAPI（uv 管理） |
| エージェント基盤 | **Microsoft Agent Framework 1.0**（core / openai / orchestrations） |
| モデル | **Azure OpenAI**（GPT-4o-mini）。OpenAI 公式 API へも `build_chat_client()` で dual-support |
| 外部連携 | Notion API（Past PRD 取得） |
| ストリーミング | Server-Sent Events（`sse-starlette` + `EventSource`）|
| ホスティング | Azure Container Apps（frontend / backend 両方） |
| Container Registry | Azure Container Registry（specifyacrtaz）|
| DB | なし（sessionStorage で結果保持） |

---

## 4. 画面構成

3 画面構成。SPA ではなく Next.js の通常ルーティング。

### 4.1 `/`（入力画面）

PRD を投入して分析を開始する。

| 要素 | 内容 |
|---|---|
| PRD 入力 | テキストエリアに貼付け、または **デモ PRD ピッカー**（KintaiKit シリーズ 3 本）から選択 |
| 「分析開始」ボタン | 押下で sessionStorage に PRD と PRD ID を保存し `/analyzing?session=<uuid>` へ遷移 |
| 上限 | 500 KB（超えると backend が 413 を返す） |

### 4.2 `/analyzing`（分析中画面）

分析の進行をリアルタイムに見せる。**agentic 感の核** となる画面。

| 要素 | 内容 |
|---|---|
| ヘッダ | 「分析中」+ 経過時間カウンタ + **中止ボタン**（SSE 接続を abort して `/` に戻る） |
| パイプライン SVG | Planner → 3 並列 → Reviewer を色分け表示。**running 状態の点線は dash-flow アニメで「データが流れる」演出** |
| 3 レーン詳細 | 各並列 Agent ごとに dot（パルス）+ 進捗バー + 状態テキスト |
| 開発者ログ | `<details>` で折りたたみ、SSE で受け取った全イベントを表示（chevron 回転 UI） |
| エラー | 構造化 error event（reason code 付き）を `ErrorBanner` で表示、retry / reset を提供 |

SSE event:
`planner_started` / `planner_completed` / `notion_fetch_started` / `notion_fetch_completed` / `workflow_started` / `executor_invoked` / `executor_completed` / `output` / `error`

### 4.3 `/result`（結果画面）

抽出された論点に対してユーザーが意思決定する「**読み物ではなく操作する画面**」。

| エリア | 内容 |
|---|---|
| ヘッダ | 「分析結果」+ 1 文 summary |
| **サマリーバー** | 1 行で全数字を集約: 意思決定論点 N 件（必須 M / 推奨 K）・過去 PRD 矛盾 X 件・決定済み n/N |
| 矛盾アラート | 過去 PRD 矛盾が 1 件以上あれば警告バナーを表示。右の **「過去 PRD 矛盾の論点を表示」ボタン** で該当論点のみ絞り込み（トグル） |
| フィルタタブ | すべて / 必須 / 推奨 / 未決定のみ。Past PRD フィルターと AND |
| 論点カード | 優先度バッジ（必須=赤 / 推奨=黄 / 任意=灰）+ **カテゴリ色分けバッジ**（バリデーション=青、空状態=紫、ローディング=シアン、ドメイン=緑、エラー=茶、異常系=橙）+ **🔗 Past PRD バッジ + 黄色左ボーダー**（`source: "past_prd"` のとき） |
| 操作 UI | 選択肢ボタン → メモ入力 → 「決定」ボタン → 進捗バーが進む |
| 画面プレビュー | PRD ごとに mock 切替（KintaiKit user-add は 5 状態切替の作り込み、shift-auto / report-monthly は静的）|
| エクスポート | 全件決定で Markdown ダウンロード / Notion 用クリップボードコピーが有効化 |
| 縮退バナー | `result.meta.failed_agents` が non-empty なら「縮退動作中」を表示（reason code 付き） |

決定状態は sessionStorage に保持（リロード対応）。session 単位で隔離。

---

## 5. API 仕様

### 5.1 エンドポイント

| Method | Path | 用途 |
|---|---|---|
| GET | `/api/health` | ヘルスチェック（Azure ヘルスプローブ用） |
| POST | `/api/analyze` | PRD 解析、進捗を SSE で逐次配信（本番動線） |
| POST | `/api/analyze/sync` | PRD 解析、JSON 一括返却（疎通確認 / 縮退テスト用） |

### 5.2 認証

- `SPECIFY_ANALYZE_TOKEN` env を設定すると `/api/analyze*` 全リクエストで `X-Specify-Token` ヘッダー一致を要求
- 未設定時はローカル開発互換のため認証スキップ
- 失敗時は `401` + `WWW-Authenticate: Bearer`

### 5.3 レート制限

- クライアント IP（`X-Forwarded-For` 優先）+ token 単位で **60 秒あたり 6 リクエスト**
- 上限超過時は `429` + `Retry-After`
- in-memory deque + asyncio.Lock 実装（単一プロセス・複数 worker では共有されない）

### 5.4 リクエスト / レスポンス

リクエスト:
```json
{ "prd_text": "..." }
```

レスポンス（`/api/analyze/sync` または SSE の `output` event）:
```json
{
  "summary": "...",
  "decisions": [ Decision ],
  "contradictions": [ Contradiction ],
  "meta": { "failed_agents": [string] }
}
```

---

## 6. データモデル

### Decision

| field | 型 | 説明 |
|---|---|---|
| `title` | string | 決めるべきことの名前 |
| `priority` | `"must" \| "should" \| "nice"` | 優先度 |
| `category` | `"validation" \| "empty_state" \| "loading" \| "error" \| "edge_case" \| "domain" \| "other"` | カテゴリ |
| `options` | string[] | 最低 3 つの選択肢 |
| `rationale` | string | なぜ決める必要があるか（1〜2 文） |
| `source` | `"past_prd" \| "agent"` | **由来**。Reviewer が必ずセット、LLM 忘れ時は backend の post-processing で rationale マッチによって補完 |

### Contradiction

| field | 型 | 説明 |
|---|---|---|
| `title` | string | 矛盾の名前 |
| `past_prd_id` | string | 過去 PRD の Notion page id |
| `past_prd_quote` | string | 過去 PRD からの引用 |
| `new_prd_quote` | string | 新 PRD からの引用 or 「言及なし」 |
| `priority` | `"must" \| "should" \| "nice"` | 優先度 |
| `rationale` | string | 説明 |

### Result

```ts
interface Result {
  summary: string;
  decisions: Decision[];
  contradictions: Contradiction[];
  meta: { failed_agents: string[] };
}
```

---

## 7. デプロイ構成（Azure）

| リソース | 名前 | 用途 |
|---|---|---|
| Resource Group | `rg-specify-prod` | 全リソース格納 |
| Region | `japaneast` | |
| Container Registry | `specifyacrtaz` | image push 先 |
| Container Apps Environment | `cae-specify` | 共通環境 |
| Container App (frontend) | `specify-frontend` | Next.js standalone、`min-replicas=1`、port 3000 |
| Container App (backend) | `specify-backend` | FastAPI、`min-replicas=1`、port 8000 |
| Azure OpenAI | （Foundry プロジェクト配下） | GPT-4o-mini デプロイ |

frontend URL: `https://specify-frontend.happyfield-8905f02b.japaneast.azurecontainerapps.io`
backend URL: `https://specify-backend.happyfield-8905f02b.japaneast.azurecontainerapps.io`

### デプロイ手順（手動）

```bash
# build (amd64 必須。M シリーズ Mac は --platform 指定が必要)
docker buildx build --platform linux/amd64 \
  -f frontend/Dockerfile -t specifyacrtaz.azurecr.io/specify-frontend:latest --push .

# revision 切替（:latest 上書きだけでは no-op になるため --revision-suffix 必須）
az containerapp update \
  --name specify-frontend --resource-group rg-specify-prod \
  --image specifyacrtaz.azurecr.io/specify-frontend:latest \
  --revision-suffix v$(date +%y%m%d%H%M)
```

backend も同様。

---

## 8. 環境変数

### Backend

| key | 必須 | 説明 |
|---|---|---|
| `AZURE_OPENAI_ENDPOINT` | △ | Azure OpenAI 利用時 |
| `AZURE_OPENAI_API_KEY` | △ | 同上 |
| `AZURE_OPENAI_DEPLOYMENT_NAME` | △ | 同上 |
| `OPENAI_API_KEY` | △ | OpenAI 公式 API 利用時（dev fallback） |
| `NOTION_API_KEY` | ○ | Past PRD Agent が Notion から過去 PRD を取得 |
| `NOTION_DATABASE_ID` | ○ | 過去 PRD が入っている Notion DB |
| `SPECIFY_ANALYZE_TOKEN` | △ | `/api/analyze*` 保護用の共有 token（未設定時は認証スキップ） |

### Frontend

| key | 必須 | 説明 |
|---|---|---|
| `BACKEND_URL` | ○ | backend のオリジン（local: `http://localhost:8000`、本番: Container App FQDN） |
| `SPECIFY_ANALYZE_TOKEN` | △ | backend と共有する token（Route Handler が `X-Specify-Token` を forward） |

---

## 9. 制約・やらないこと

- 認証（ユーザー管理）追加禁止（デモは 1 ユーザー前提、API は共有 token のみ）
- DB 追加禁止
- Figma 連携禁止
- 本物の Storybook ランタイム統合禁止
- 任意のデザインシステム読み込み禁止
- 実コード生成（.tsx 出力）禁止
- 修正案の自動生成禁止
- 学習機能・履歴機能禁止

---

## 10. 既知の制約 / 今後の課題

- **レート制限は単一プロセス内のみ**。Container Apps の水平スケール時は worker 間で共有されない
- **`X-Forwarded-For` を無条件で信頼**しており、直接 internet 公開すると IP 詐称でレート制限を回避可能（Container Apps の Front Door 配下前提）
- **`hmac.compare_digest` 未使用**。token 比較が短絡評価のままで原則的なタイミング攻撃耐性なし
- LLM 出力で `source` フィールドを LLM が落とすケースに備え、reviewer 側で rationale マッチによる post-processing 補完を入れている。**prompt 文言（「との矛盾により格上げ」「過去 PRD 〜では言及がない」）を変更する際は backend の補完ロジックも同時更新が必要**
- 画面プレビューは PRD ごとにハードコード（KintaiKit 用 3 本のみ）。decisions から動的に状態を導出する拡張は未実装
- `@app.on_event("startup")` は FastAPI で deprecated。`lifespan` への移行未実施

---

## 11. 主要ファイル

| パス | 役割 |
|---|---|
| `backend/src/specify_backend/api.py` | FastAPI app、SSE event generator、認証 / レート制限 |
| `backend/src/specify_backend/orchestrator.py` | Planner → ConcurrentBuilder → Reviewer の制御 |
| `backend/src/specify_backend/schemas.py` | OpenAI Structured Outputs 用 JSON Schema |
| `backend/src/specify_backend/agents/*.py` | 各 Agent の prompt と builder |
| `backend/src/specify_backend/notion.py` | Notion クライアント（data_sources.query API） |
| `frontend/app/page.tsx` | 入力画面 |
| `frontend/app/analyzing/page.tsx` | 分析中画面（SVG パイプライン / SSE 受信）|
| `frontend/app/result/page.tsx` | 結果画面 |
| `frontend/app/api/analyze/route.ts` | backend への SSE proxy（token forward） |
| `frontend/lib/sse-client.ts` | SSE クライアント（CRLF 正規化対応） |
| `frontend/lib/types.ts` | 共有型 |
| `docs/zenn_content.md` | Zenn 公開記事原稿 |
| `docs/CLAUDE.md` | プロダクト方針、Week 1〜7 計画 |
