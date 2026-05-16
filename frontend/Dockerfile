# Specify frontend (Next.js 16 App Router) の本番イメージ。
#
# 設計方針:
#   - multi-stage build で依存解決 / ビルド / 実行ランタイムを分離
#   - next.config.ts の `output: 'standalone'` を前提に runner stage を最小化
#   - non-root user で実行（Azure 推奨）、HOSTNAME=0.0.0.0 を明示
#
# ビルド: docker build -f frontend/Dockerfile -t specify-frontend .
# 実行 : docker run -p 3000:3000 -e BACKEND_URL=http://host.docker.internal:8000 specify-frontend

# -----------------------------------------------------------------------------
# Stage 1: deps  -- 依存解決だけ（package*.json が変わらない限りキャッシュ再利用）
# -----------------------------------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# -----------------------------------------------------------------------------
# Stage 2: builder -- Next.js のビルド（standalone 出力を生成）
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY frontend/ ./
# Telemetry を切ってビルド時間を安定化させる（任意）。
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 3: runner -- standalone を最小ランタイムで実行
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    # standalone server.js は HOSTNAME と PORT を env で読む。
    # 0.0.0.0 にしないとコンテナ外から到達できない（Azure 必須）。
    HOSTNAME=0.0.0.0 \
    PORT=3000

# non-root で実行。alpine は addgroup / adduser が BusyBox 構文。
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# standalone build の成果物は 3 ファイル群:
#   1. .next/standalone/  : server.js + 必要な node_modules
#   2. .next/static/      : ハッシュ付き静的ファイル（クライアントバンドル）
#   3. public/            : 静的アセット（favicon 等）
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
