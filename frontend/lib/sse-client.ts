/**
 * Specify 用 SSE クライアント。
 *
 * バックエンドの POST /api/analyze は sse-starlette で SSE を返す。
 * ブラウザ標準の EventSource は GET 限定なので、ここでは
 *   - fetch + ReadableStream.getReader() で chunk 取得
 *   - TextDecoder で文字列化、`\n\n` で区切って 1 イベントを取り出す
 *   - `event:` / `data:` 行をパースして handler を呼ぶ
 * という最小実装にする。自動再接続なし（MVP）。
 */

import type {
  ErrorPayload,
  ErrorType,
  ProgressEvent,
  ProgressEventType,
  Result,
} from "./types";

/** onError ハンドラに渡す構造化エラー情報。 */
export interface StructuredError {
  /** UI 表示用のメッセージ文字列。 */
  message: string;
  /** 不明時 "unknown"（接続失敗 / ストリーム読み取り失敗等のクライアント側エラー含む）。 */
  errorType: ErrorType;
  /** false なら「再試行」ボタンを出さない。 */
  retryable: boolean;
}

/** バックエンド側で 1 メッセージの data 部に詰める形（api.py の _to_sse_message と一致）。 */
interface SsePayload {
  message: string;
  data: unknown;
}

export interface SseHandlers {
  /** すべての ProgressEvent に対して呼ばれる（EventList 表示用）。 */
  onProgress?: (ev: ProgressEvent) => void;
  /** executor_invoked（dispatcher 含む）の convenience。 */
  onExecutorInvoked?: (executorId: string) => void;
  /** executor_completed（dispatcher 含む）の convenience。 */
  onExecutorCompleted?: (executorId: string) => void;
  /** output 時、最終結果。これを受けたら /result に遷移する想定。 */
  onOutput?: (result: Result) => void;
  /** error 時。HTTP エラーやストリーム途中の error イベント両方をここに集約。 */
  onError?: (error: StructuredError) => void;
}

/**
 * SSE のテキストストリームを 1 イベントずつ yield する非同期ジェネレータ。
 *
 * SSE フォーマット:
 *   event: <name>
 *   data: <json>
 *   <空行>
 *
 * data が複数行に分かれる場合もあるが、本バックエンドは 1 行にまとめてくる
 * （json.dumps 結果）ので単純に連結する。`:` で始まる行はコメント（heartbeat 等）で無視。
 */
async function* parseSseStream(
  stream: ReadableStream<Uint8Array>,
): AsyncIterableIterator<{ event: string; data: string }> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    // SSE は \r\n / \r / \n のいずれの改行も合法（W3C 仕様）。sse-starlette は \r\n を出す
    // ため、ここで LF に正規化しないと buffer.indexOf("\n\n") が \r\n\r\n の中の \n を
    // 連続として見つけられない（間に \r が挟まる）。
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n?/g, "\n");

    // `\n\n` が出るたびに 1 イベントを切り出す。最後の不完全 chunk は buffer に残す。
    let sepIdx: number;
    while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);
      let event = "message";
      const dataLines: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith(":") || line.length === 0) continue;
        if (line.startsWith("event:")) {
          event = line.slice(6).trimStart();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trimStart());
        }
      }
      // sse-starlette の heartbeat（`: ping - ...`）はコメント行のみで構成されるため
      // dataLines が空になる。そのまま yield すると JSON.parse が空文字で落ちるので skip。
      if (dataLines.length === 0) continue;
      yield { event, data: dataLines.join("") };
    }
  }
}

/**
 * /api/analyze に PRD を投げて SSE ストリームを開く。
 *
 * 呼び出し側にはキャンセル用関数を返す。useEffect の cleanup でこれを呼べば、
 * unmount 時にネットワークリクエストが abort される。
 */
export function openAnalyzeStream(
  prdText: string,
  handlers: SseHandlers,
): () => void {
  const ac = new AbortController();

  // 即時に async 処理を走らせ、呼び出し側には abort 関数だけ返す。
  // try/catch 内は AbortError を「正常な中断」として無視する。
  (async () => {
    let res: Response;
    try {
      res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prd_text: prdText }),
        signal: ac.signal,
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      // fetch 自体が失敗（バックエンド未起動 / ネットワーク断 / CORS 等）。
      // ユーザーは再試行で復旧する可能性が高いので retryable=true。
      handlers.onError?.({
        message: `接続失敗: ${(e as Error).message}`,
        errorType: "timeout",
        retryable: true,
      });
      return;
    }

    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      // HTTP エラーは status から推測。401/403 は auth、429 は rate_limit、それ以外は unknown。
      const errorType: ErrorType =
        res.status === 401 || res.status === 403
          ? "auth"
          : res.status === 429
            ? "rate_limit"
            : "unknown";
      const retryable = errorType !== "auth";
      handlers.onError?.({
        message: `API error ${res.status}: ${detail}`,
        errorType,
        retryable,
      });
      return;
    }

    try {
      for await (const raw of parseSseStream(res.body)) {
        let payload: SsePayload;
        try {
          payload = JSON.parse(raw.data) as SsePayload;
        } catch {
          // パース失敗は無視（不完全なメッセージ等の防御）。
          continue;
        }

        const progressEv: ProgressEvent = {
          type: raw.event as ProgressEventType,
          message: payload.message,
          data: payload.data,
        };
        handlers.onProgress?.(progressEv);

        if (raw.event === "executor_invoked") {
          const id = (payload.data as { executor_id?: string } | null)
            ?.executor_id;
          if (id) handlers.onExecutorInvoked?.(id);
        } else if (raw.event === "executor_completed") {
          const id = (payload.data as { executor_id?: string } | null)
            ?.executor_id;
          if (id) handlers.onExecutorCompleted?.(id);
        } else if (raw.event === "output") {
          handlers.onOutput?.(payload.data as Result);
        } else if (raw.event === "error") {
          // バックエンド側で classify_exception 済み。data に error_type / retryable が乗ってくる。
          // 古いバックエンドや想定外形式に備えて default を unknown / retryable=true にする。
          const errPayload = (payload.data ?? null) as ErrorPayload | null;
          handlers.onError?.({
            message: payload.message,
            errorType: errPayload?.error_type ?? "unknown",
            retryable: errPayload?.retryable ?? true,
          });
        }
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      handlers.onError?.({
        message: `ストリーム読み取りエラー: ${(e as Error).message}`,
        errorType: "unknown",
        retryable: true,
      });
    }
  })();

  return () => ac.abort();
}
