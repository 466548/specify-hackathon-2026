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
const nextConfig: NextConfig = {
  // 本番 Docker イメージで `.next/standalone/server.js` を起動する形に最適化する。
  // node_modules を含む最小ランタイム + server.js だけを runner stage にコピーすれば
  // 動くため、イメージサイズが大きく縮む。Azure App Service for Containers /
  // Container Apps いずれでも推奨される構成。
  output: "standalone",
};

export default nextConfig;
