/**
 * 小さな SVG ベースのスピナー。Tailwind の animate-spin で回す。
 *
 * size プロパティで縦横ピクセル指定（既定 20px）。
 * Button の loading 表示にも使うため、他コンポーネントに依存しないように単純化。
 */

interface SpinnerProps {
  size?: number;
  className?: string;
}

export function Spinner({ size = 20, className = "" }: SpinnerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`animate-spin ${className}`}
      aria-hidden="true"
    >
      {/* 外側の薄い円。プログレスが見えるよう半透明。 */}
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.25"
      />
      {/* 12 時方向から 90° の弧。これが回転して見える。 */}
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
