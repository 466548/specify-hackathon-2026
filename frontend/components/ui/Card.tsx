/**
 * シンプルな Card レイアウト。
 *
 * padding + border + radius + 軽い shadow。結果画面の各セクションや
 * /analyzing 画面の Agent カードに使う。
 */

import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Card({ children, className = "", ...rest }: CardProps) {
  return (
    <div
      className={[
        "bg-card border border-border rounded-md p-4",
        "shadow-sm",
        className,
      ].join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}
