"use client";

/**
 * 入力画面（/）。
 *
 * - PRD テキストを Textarea に入力
 * - 「分析開始」で sessionStorage に保存 → /analyzing?session=<id> へ
 * - 直前に入力した PRD があれば自動復元（ブラウザバック対応）
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import {
  SessionStorageQuotaError,
  loadLastPrd,
  savePrd,
} from "@/lib/session-storage";

export default function Home() {
  const router = useRouter();
  const [prd, setPrd] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // 起動時に直前の PRD を復元（/result → ブラウザバックで戻った時の利便性）。
  // 確認ダイアログは出さず、そっとプリフィルする。
  //
  // React 19 の react-hooks/set-state-in-effect が effect 内の setState を警告するが、
  // sessionStorage は SSR で no-op、クライアントマウント後にだけ値を読みたい、
  // useState の lazy 初期化では SSR/CSR で値が食い違って hydration mismatch するため、
  // effect で 1 回だけセットするのが最も安全。ここは意図的に suppress する。
  useEffect(() => {
    const last = loadLastPrd();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (last) setPrd(last);
  }, []);

  function handleAnalyze() {
    const text = prd.trim();
    if (!text) {
      setError("PRD を入力してください");
      return;
    }
    // crypto.randomUUID() は Web 標準（ブラウザネイティブ）。Node 環境では SSR でも動くが
    // この関数は onClick から呼ばれるため必ずクライアント側で実行される。
    const sessionId = crypto.randomUUID();
    try {
      savePrd(sessionId, text);
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
    <main className="flex-1 w-full max-w-3xl mx-auto px-6 py-12 flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Specify</h1>
        <p className="text-sm text-text-muted">
          PRD から「決まっていない意思決定」を Agent が並列で洗い出します。
        </p>
      </header>

      <Textarea
        label="PRD（製品要件書）"
        value={prd}
        onChange={(v) => {
          setPrd(v);
          if (error) setError(null);
        }}
        placeholder="ここに PRD をペーストしてください..."
        rows={16}
      />

      {error && (
        <div
          role="alert"
          className="text-sm text-error border border-error/30 bg-error/10 rounded-md px-3 py-2"
        >
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={handleAnalyze} disabled={!prd.trim()}>
          分析開始
        </Button>
      </div>
    </main>
  );
}
