import { cn } from "@/lib/utils";

interface AmberAsteriskProps {
  className?: string;
}

export function AmberAsterisk({ className }: AmberAsteriskProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("fill-current", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Six-pointed asterisk design */}
      <g>
        {/* First line (vertical) */}
        <rect x="47" y="5" width="6" height="90" rx="3" />
        {/* Second line (diagonal /) */}
        <rect
          x="12.5"
          y="22.5"
          width="6"
          height="90"
          rx="3"
          transform="rotate(60 50 50)"
        />
        {/* Third line (diagonal \) */}
        <rect
          x="12.5"
          y="22.5"
          width="6"
          height="90"
          rx="3"
          transform="rotate(120 50 50)"
        />
        {/* Center circle */}
        <circle cx="50" cy="50" r="8" />
      </g>
    </svg>
  );
}