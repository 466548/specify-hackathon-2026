# Specify

PRD から「決まっていない意思決定」を体系的に炙り出すマルチエージェント。
Microsoft Agent Hackathon 2026 提出用プロダクト。

詳細な背景・設計方針は [`CLAUDE.md`](./CLAUDE.md) を参照。

## ディレクトリ構成

```
.
├── CLAUDE.md          # プロダクト方針 / Cursor・Claude Code 用の指示
├── README.md
├── .env.example       # 環境変数のひな型（.env にコピーして使う）
├── .gitignore
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

## 進め方

実装フェーズと優先順位は [`CLAUDE.md`](./CLAUDE.md) の「実装の優先順位」を参照。
