/**
 * 進捗イベント一覧（時系列）。
 *
 * /analyzing 画面で SSE から受け取った ProgressEvent[] を縦リスト表示する。
 * Step 2 ではまだ使わないが先に骨組みを用意。Step 4 で SSE 駆動になる。
 */

import type { ProgressEvent } from "@/lib/types";

interface EventListProps {
  events: ProgressEvent[];
}

export function EventList({ events }: EventListProps) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-text-muted">分析を開始しました...</p>
    );
  }
  return (
    <ol className="flex flex-col gap-1 font-mono text-xs leading-5">
      {events.map((ev, i) => (
        <li key={i} className="text-text-muted">
          <span className="text-text">[{ev.type}]</span> {ev.message}
        </li>
      ))}
    </ol>
  );
}
