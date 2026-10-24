"use client";

import { KOYN_WORDMARK } from "@/components/terminal/wordmark";

export default function AsciiWordmark() {
  return (
    <div className="term-mark">
      <p className="term-dim">&lt; labs-terminal &gt;</p>
      <pre
        aria-label="KOYN"
        className="term-mark-art"
      >
        {KOYN_WORDMARK}
      </pre>
    </div>
  );
}
