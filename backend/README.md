# Specify Backend

Microsoft Agent Framework 1.0 + Azure OpenAI を使った意思決定論点抽出エージェント群。

## セットアップ

uv が未インストールの場合は先にインストール:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

依存解決と仮想環境作成（`.venv` が自動で作られる）:

```bash
cd backend
uv sync
```

## 実行

未実装。Week 1〜2 で最小エージェントを `src/specify_backend/` 配下に置く。

## 依存

- `microsoft-agent-framework` — エージェントオーケストレーション
- `openai` — OpenAI / Azure OpenAI クライアント
- `python-dotenv` — `.env` 読み込み（リポジトリルートの `.env` を参照）

## セキュリティ

- `SPECIFY_ANALYZE_TOKEN` を設定すると `/api/analyze` 系が `X-Specify-Token` で保護される
- 同時にクライアント IP 単位の簡易レート制限が有効になる
- `TRUST_PROXY_HEADERS=1` は、信頼できるリバースプロキシ配下でのみ設定する
- `TRUST_PROXY_HEADERS` を設定しない場合、`X-Forwarded-For` / `X-Real-IP` はレート制限に使わない
