"use client";

import { LABS_WORDMARK } from "@/components/terminal/wordmark";

export default function AsciiWordmark() {
  return (
    <div className="term-mark">
      <p className="term-dim">&lt; labs-terminal &gt;</p>
      <pre
        aria-label="LABS"
        className="term-mark-art"
      >
        {LABS_WORDMARK}
      </pre>
    </div>
  );
}
