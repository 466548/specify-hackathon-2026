"use client";

/**
 * 入力画面（/）。
 *
 * Week 5 までは自由入力 Textarea だったが、デモ価値と Decision Agent の安定性
 * を優先して、`lib/demo-prds.ts` に登録された KintaiKit 3 機能から選ぶ
 * カード式 UI に変更した（5/17）。自由入力廃止により、審査員が変な PRD を
 * 投げて Agent が誤動作するリスクが 0 になる。
 *
 * カードをクリックすると:
 *   1. `savePrd(uuid, prd.prdText)` で sessionStorage に保存
 *   2. `/analyzing?session=<uuid>` へ遷移
 *   3. /analyzing 側で loadPrd して SSE で分析開始
 *
 * /analyzing → /result の流れは Week 5 と同じ。
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Card } from "@/components/ui/Card";
import { DEMO_PRDS, type DemoPrd } from "@/lib/demo-prds";
import {
  SessionStorageQuotaError,
  savePrd,
  savePrdId,
} from "@/lib/session-storage";

export default function Home() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  function handleSelect(prd: DemoPrd) {
    // crypto.randomUUID() は secure context (https / localhost / 127.0.0.1) のみ動作。
    // dev で LAN IP (192.168.x.x など) 経由アクセスすると例外を投げるため fallback を用意。
    // 本番 Azure では HTTPS なので primary パスで通る。
    let sessionId: string;
    try {
      sessionId = crypto.randomUUID();
    } catch {
      sessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    try {
      savePrd(sessionId, prd.prdText);
      savePrdId(sessionId, prd.id);
    } catch (e) {
      if (e instanceof SessionStorageQuotaError) {
        setError(e.message);
        return;
      }
      throw e;
    }
    router.push(`/analyzing?session=${sessionId}`);
  }

  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-6 py-12 flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Specify</h1>
        <p className="text-sm text-text-muted">
          PRD から「決まっていない意思決定」を Agent が並列で洗い出します。
        </p>
        <p className="text-sm text-text-muted">
          下から PRD を 1 つ選んで分析を開始してください。
        </p>
      </header>

      {/* PRD 選択カード一覧 */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-text-muted">
          KintaiKit（勤怠管理 SaaS）の新機能 PRD
        </h2>
        <div className="flex flex-col gap-3">
          {DEMO_PRDS.map((prd) => (
            <PrdCard key={prd.id} prd={prd} onSelect={handleSelect} />
          ))}
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="text-sm text-error border border-error/30 bg-error/10 rounded-md px-3 py-2"
        >
          {error}
        </div>
      )}
    </main>
  );
}

/**
 * PRD 選択カード。クリックで onSelect を呼ぶ。
 * button 要素にして a11y / キーボード操作（Enter/Space）に対応。
 */
function PrdCard({
  prd,
  onSelect,
}: {
  prd: DemoPrd;
  onSelect: (prd: DemoPrd) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(prd)}
      // block w-full でボタンの click 領域を Card の幅いっぱいに広げる。
      // button のデフォルト display: inline-block だと右側のクリックを取りこぼすことがあった。
      className="text-left group block w-full"
    >
      <Card className="flex flex-col gap-2 transition group-hover:border-primary group-hover:shadow-md cursor-pointer">
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded bg-bg text-text-muted">
            {prd.category}
          </span>
          <span className="text-base font-medium">{prd.title}</span>
        </div>
        <p className="text-sm text-text-muted">{prd.description}</p>
      </Card>
    </button>
  );
}
