import type { NextConfig } from "next";

/**
 * Next.js 設定。
 *
 * `/api/*` のプロキシは以前 rewrites() で行っていたが、Next.js 16 の rewrites は
 * SSE chunk をバッファしてしまい逐次配信できなかったため、Route Handler
 * （`app/api/analyze/route.ts`）に置き換えた。
 *
 * 本番デプロイ（Week 6）でも同じ Route Handler を使えるので、ホスト切替は
 * BACKEND_URL 環境変数で行う想定。
 */
const nextConfig: NextConfig = {};

export default nextConfig;
