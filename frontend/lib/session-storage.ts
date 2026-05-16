/**
 * sessionStorage ラッパ。
 *
 * 3 画面（/ → /analyzing → /result）間で PRD テキストと結果を持ち回るために使う。
 * URL クエリの ?session=<id> で識別し、PRD / 結果 / 進捗を別キーで保存する。
 *
 * key 規約:
 *   session:<id>:prd     PRD 入力テキスト
 *   session:<id>:result  実行結果（Result 型の JSON）
 *   session:<id>:status  進捗イベント配列（optional、Step 4 で使用）
 *
 * 制約:
 *   - SSR / Server Component から呼ばれた時は no-op（typeof window === 'undefined' で guard）
 *   - PRD 上限 5MB（sessionStorage の実質的な上限を考慮した安全側の見積もり）
 */

import type { ProgressEvent, Result } from "./types";

const MAX_PRD_BYTES = 5 * 1024 * 1024;

// SessionStorage 容量超過時のカスタム例外。UI 側で握って「PRD が大きすぎます」を出す想定。
export class SessionStorageQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionStorageQuotaError";
  }
}

// SSR ガード。Server Component から誤って呼ばれた場合は no-op で抜ける。
function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}

function keyPrd(sessionId: string): string {
  return `session:${sessionId}:prd`;
}
function keyPrdId(sessionId: string): string {
  return `session:${sessionId}:prdId`;
}
function keyResult(sessionId: string): string {
  return `session:${sessionId}:result`;
}
function keyStatus(sessionId: string): string {
  return `session:${sessionId}:status`;
}

// --- PRD ------------------------------------------------------------------

export function savePrd(sessionId: string, prdText: string): void {
  const storage = getStorage();
  if (!storage) return;

  // バイト数で 5MB を超えるかチェック。UTF-8 想定なので Blob で測る。
  // Blob は Web 標準で SSR でも使えるはずだが、上の SSR ガードで弾かれているので安全。
  if (new Blob([prdText]).size > MAX_PRD_BYTES) {
    throw new SessionStorageQuotaError(
      `PRD が ${MAX_PRD_BYTES / 1024 / 1024}MB を超えています`,
    );
  }
  try {
    storage.setItem(keyPrd(sessionId), prdText);
  } catch (e) {
    // ブラウザ実装が QuotaExceededError を投げてきたケース。
    if (e instanceof DOMException && e.name === "QuotaExceededError") {
      throw new SessionStorageQuotaError("sessionStorage の容量が不足しています");
    }
    throw e;
  }
}

export function loadPrd(sessionId: string): string | null {
  const storage = getStorage();
  if (!storage) return null;
  return storage.getItem(keyPrd(sessionId));
}

// --- PRD ID ---------------------------------------------------------------
// どの DEMO_PRD が選ばれたかを記録する。/result でプレビュー UI のドメイン
// 分岐（"user-add" のときだけモーダル mock を出す等）に使う。

export function savePrdId(sessionId: string, prdId: string): void {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(keyPrdId(sessionId), prdId);
}

export function loadPrdId(sessionId: string): string | null {
  const storage = getStorage();
  if (!storage) return null;
  return storage.getItem(keyPrdId(sessionId));
}

/**
 * ブラウザバック時の入力復元用に「最後に保存された PRD」を返す。
 *
 * sessionStorage を全件走査し session:*:prd キーのうち最新（key 名順では決まらないので
 * 単純に「どれか 1 つ」）を返す。Week 5 デモ範囲ではこれで充分。複数同時実行や
 * 厳密な「最終更新」が要るなら timestamp を別途保存する方式に拡張。
 */
export function loadLastPrd(): string | null {
  const storage = getStorage();
  if (!storage) return null;
  for (let i = storage.length - 1; i >= 0; i--) {
    const key = storage.key(i);
    if (key && key.endsWith(":prd") && key.startsWith("session:")) {
      return storage.getItem(key);
    }
  }
  return null;
}

// --- Result ---------------------------------------------------------------

export function saveResult(sessionId: string, result: Result): void {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(keyResult(sessionId), JSON.stringify(result));
}

export function loadResult(sessionId: string): Result | null {
  const storage = getStorage();
  if (!storage) return null;
  const raw = storage.getItem(keyResult(sessionId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Result;
  } catch {
    // 壊れた JSON は無視（リロード時の保護）。
    return null;
  }
}

// --- Status（進捗イベント配列） -------------------------------------------
// Step 4 で SSE 駆動の /analyzing が使う想定。Step 2 ではまだ呼ばないが先に書いておく。

export function saveStatus(sessionId: string, events: ProgressEvent[]): void {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(keyStatus(sessionId), JSON.stringify(events));
}

export function loadStatus(sessionId: string): ProgressEvent[] | null {
  const storage = getStorage();
  if (!storage) return null;
  const raw = storage.getItem(keyStatus(sessionId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ProgressEvent[];
  } catch {
    return null;
  }
}
