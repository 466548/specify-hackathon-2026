# Specify

PRD から「決まっていない意思決定」を体系的に炙り出すマルチエージェント。
Microsoft Agent Hackathon 2026 提出用プロダクト。

詳細な背景・設計判断・実装解説は Zenn 記事を参照: <https://zenn.dev/466548/articles/zenn-specify-article-final>

## ディレクトリ構成

```
.
├── README.md
├── .env.example       # 環境変数のひな型（.env にコピーして使う）
├── .gitignore
├── docker-compose.yml # ローカル E2E 確認用
├── scripts/           # Azure デプロイスクリプト
├── demo-data/         # サンプル PRD（KintaiKit ユーザー追加モーダル）
├── frontend/          # Next.js (App Router, TypeScript)
└── backend/           # Python 3.12 (uv) - Microsoft Agent Framework 1.0
```

## セットアップ

### 1. 環境変数

```bash
cp .env.example .env
# .env を開いてキーを書く
```

最低限 `OPENAI_API_KEY` があれば Week 1〜2 の疎通確認は可能。
Azure OpenAI への切替は Week 3 以降。
`SPECIFY_ANALYZE_TOKEN` を設定すると `/api/analyze` 系が共有トークンで保護される。
frontend 側は `frontend/.env.local`、backend 側はリポジトリルートの `.env` に入れる。

### 2. Backend（Python / uv）

[uv](https://docs.astral.sh/uv/) を未インストールの場合:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

依存解決と仮想環境構築:

```bash
cd backend
uv sync
```

### 3. Frontend（Next.js）

```bash
cd frontend
npm install
npm run dev
```

`http://localhost:3000` で開く。

## デプロイ

Azure Container Apps（japaneast / `cae-specify` 環境）で稼働中。

- Frontend: <https://specify-frontend.happyfield-8905f02b.japaneast.azurecontainerapps.io>
- 構成スクリプト: [`scripts/`](./scripts/)（`az containerapp create` の初回構築用）
