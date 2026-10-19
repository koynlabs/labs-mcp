import type { ReactNode } from "react";

export function Panel({
  children,
  accent = false,
  title,
}: {
  children: ReactNode;
  accent?: boolean;
  title?: string;
}) {
  return (
    <article className={accent ? "panel panel-accent" : "panel"}>
      {title ? <h3>{title}</h3> : null}
      {children}
    </article>
  );
}
