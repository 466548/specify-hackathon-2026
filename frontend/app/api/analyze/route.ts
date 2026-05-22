/**
 * /api/analyze の Route Handler。
 *
 * バックエンド（FastAPI + sse-starlette）への streaming プロキシ。
 *
 * なぜ next.config.ts の rewrites ではなくこちらを使うか:
 *   Next.js 16 の rewrites() は SSE chunk を最後までバッファしてから forward する
 *   挙動になっており、進捗イベントが逐次配信されない（Week 5 デバッグで判明）。
 *   Route Handler は Web 標準の Response(ReadableStream) を返せるため、
 *   upstream.body をそのまま pipe すれば streaming が保たれる。
 *
 * フロント側（lib/sse-client.ts）は同一オリジンの `/api/analyze` を fetch するので、
 * このファイルが追加されるだけで透過的に差し替わる（既存コードに変更不要）。
 */

// 本番（Week 6 デプロイ）では別ホストの API を指せるよう env で外出し。
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";
const ANALYZE_TOKEN = process.env.SPECIFY_ANALYZE_TOKEN ?? "";

// Next.js 16 のデフォルトでは Route Handler の最適化判定で SSE 応答をバッファ化する
// 可能性があるため、明示的に dynamic 扱いにしてビルド/ランタイムの両方で streaming を
// 保証する。Azure App Service / Container Apps 等のリバプロ越しでも安全側に倒す。
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  // 受け取った JSON ボディはそのまま forward する（パースはバックエンドに任せる）。
  const body = await request.text();
  const token = ANALYZE_TOKEN.trim();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["X-Specify-Token"] = token;
  }
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    headers["X-Forwarded-For"] = forwardedFor;
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    headers["X-Real-IP"] = realIp;
  }

  const upstream = await fetch(`${BACKEND_URL}/api/analyze`, {
    method: "POST",
    headers,
    body,
    // @ts-expect-error: Node 18+ の undici で streaming body を送るのに必要。
    // 型定義に未反映だがランタイムは受け付ける（Web Fetch 仕様の duplex）。
    duplex: "half",
  });

  // エラー時はストリームを開かず即座に詳細を返す。バックエンドの 422/413/500 を素通し。
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return new Response(detail, { status: upstream.status });
  }

  // upstream.body をそのまま渡すことで chunk が逐次クライアントに届く。
  // Content-Type は明示指定（upstream の Headers を素通しすると hop-by-hop で事故りやすい）。
  // X-Accel-Buffering: no は nginx 等の前段プロキシでもバッファされないための保険。
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
