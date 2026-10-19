"use client";

import { useId, useState } from "react";

export default function CopyField({ value, label }: { value: string; label: string }) {
  const id = useId();
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    const field = document.getElementById(id);
    if (field instanceof HTMLInputElement) {
      field.focus();
      field.select();
    }
    let copied = false;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await Promise.race([
        navigator.clipboard.writeText(value),
        new Promise((_, reject) => {
          window.setTimeout(() => reject(new Error("clipboard timed out")), 800);
        }),
      ]);
      copied = true;
    } catch {
      try {
        copied = document.execCommand("copy");
      } catch {
        copied = false;
      }
    }
    setState(copied ? "copied" : "failed");
    window.setTimeout(() => setState("idle"), 1800);
  }

  const buttonLabel = state === "copied" ? "Copied" : state === "failed" ? "Select" : "Copy";

  return (
    <div className="copy-field">
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <input id={id} readOnly value={value} onFocus={(event) => event.currentTarget.select()} />
      <button type="button" onClick={copy} aria-live="polite">
        {buttonLabel}
      </button>
    </div>
  );
}
