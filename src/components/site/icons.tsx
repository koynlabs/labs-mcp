import type { ReactNode } from "react";

type IconProps = { className?: string };

function Svg({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none">
      {children}
    </svg>
  );
}

const stroke = {
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function LaunchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path {...stroke} d="M12 19V5M12 5l-4.5 4.5M12 5l4.5 4.5" />
      <path {...stroke} d="M5 19h14" />
    </Svg>
  );
}

export function TradeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path {...stroke} d="M7 7h11l-2.5-2.5M17 17H6l2.5 2.5" />
      <path {...stroke} d="M18 7v4M6 17v-4" />
    </Svg>
  );
}

export function PerpsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path {...stroke} d="M4 19h16" />
      <path {...stroke} d="M6 15l4-5 3 3 5-7" />
    </Svg>
  );
}

export function MakerIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path {...stroke} d="M4 8h7M4 12h7M4 16h7" />
      <path {...stroke} d="M14 8h6M14 16h6" />
    </Svg>
  );
}

export function XIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect {...stroke} x="4" y="5" width="16" height="14" rx="2" />
      <path {...stroke} d="M8 9h8M8 12.5h5" />
    </Svg>
  );
}
