# Specify backend (FastAPI + sse-starlette) の本番イメージ。
#
# 設計方針:
#   - uv の公式静的バイナリで pyproject.toml + uv.lock から再現性のあるインストール
#   - layer caching を効かせるため deps install を src コピーより前に行う
#   - non-root user で実行（Azure Container Apps のセキュリティ要件にも合致）
#
# ビルド: docker build -f backend/Dockerfile -t specify-backend .
# 実行 : docker run -p 8000:8000 --env-file backend/.env specify-backend

FROM python:3.12-slim

# uv の公式静的バイナリを取り込む。バージョン固定で再現性確保。
# /uv と /uvx の 2 バイナリだけが必要。
COPY --from=ghcr.io/astral-sh/uv:0.5 /uv /uvx /bin/

# 環境変数:
#   - UV_LINK_MODE=copy : COPY された read-only mount から symlink を避ける
#   - UV_COMPILE_BYTECODE=1 : .pyc を事前生成して起動を高速化
#   - PYTHONUNBUFFERED=1 : print / log を即時 stdout に流す（コンテナログ向け）
ENV UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# 依存関係だけ先に install（uv.lock 不変なら layer を再利用できる）。
# README.md も同時に COPY する: pyproject.toml の `readme = "README.md"` 指定で
# hatchling が validate 時に必須ファイル扱いするため。
COPY backend/pyproject.toml backend/uv.lock backend/README.md ./
RUN uv sync --frozen --no-dev --no-install-project

# ソースコードを後から COPY して、コード変更時の rebuild を高速化。
COPY backend/src ./src
RUN uv sync --frozen --no-dev

# non-root で実行（Container Apps / App Service の推奨）。
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# 本番用の uvicorn 起動。reload は付けない（dev 用 specify_backend.api:run と分離）。
# --host 0.0.0.0 は外部から到達するために必須（Container Apps / App Service 共通要件）。
CMD ["uv", "run", "uvicorn", "specify_backend.api:app", "--host", "0.0.0.0", "--port", "8000"]
