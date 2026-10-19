"use client";

import Link from "next/link";
import type { ReactNode } from "react";

type Variant = "primary" | "ghost";
type Size = "sm" | "md" | "lg";

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string): string {
  return ["btn", variant === "ghost" ? "btn-ghost" : "btn-primary", size === "sm" ? "btn-sm" : "", size === "lg" ? "btn-lg" : "", className]
    .filter(Boolean)
    .join(" ");
}

export function Button({
  href,
  children,
  variant = "primary",
  size = "md",
  type = "button",
  disabled,
  onClick,
  className,
}: {
  href?: string;
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const classes = buttonClass(variant, size, className);
  if (href) {
    const plain = /^(https?:|mailto:|tel:)/.test(href) || /\.[a-z0-9]+$/i.test(href.split(/[?#]/)[0] ?? "");
    if (plain) {
      return (
        <a className={classes} href={href}>
          {children}
        </a>
      );
    }
    return (
      <Link className={classes} href={href}>
        {children}
      </Link>
    );
  }
  return (
    <button className={classes} type={type} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
