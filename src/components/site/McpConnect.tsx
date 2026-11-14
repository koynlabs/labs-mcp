"use client";

import { useId, useRef, useState } from "react";
import { MCP_HARNESS_NOTE, mcpHarnessLinks, type McpHarnessLink } from "@/lib/mcp-harness";

async function writeClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      const copied = document.execCommand("copy");
      area.remove();
      return copied;
    } catch {
      return false;
    }
  }
}

export default function McpConnect({
  name,
  url,
  label = "Connect",
  className,
}: {
  name: string;
  url: string;
  label?: string;
  className?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const links = mcpHarnessLinks({ name, url });
  const [note, setNote] = useState<string | null>(null);

  function open() {
    setNote(null);
    dialogRef.current?.showModal();
  }

  function choose(link: McpHarnessLink) {
    if (link.href?.startsWith("http")) {
      window.open(link.href, "_blank", "noopener,noreferrer");
    }
    const pending = link.copyText ? writeClipboard(link.copyText) : Promise.resolve(true);
    void pending.then((copied) => {
      setNote(copied ? link.detail : "Copy failed. Select the URL below.");
    });
    if (link.href && !link.href.startsWith("http")) {
      window.location.assign(link.href);
    }
  }

  async function copyUrl() {
    const copied = await writeClipboard(url);
    setNote(copied ? "URL copied." : "Select the URL and copy it.");
  }

  return (
    <>
      <button type="button" className={className} onClick={open}>
        {label}
      </button>
      <dialog
        ref={dialogRef}
        className="mcp-harness"
        aria-labelledby={titleId}
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current?.close();
        }}
        onClose={() => setNote(null)}
      >
        <div className="mcp-harness__sheet">
          <div className="mcp-harness__head">
            <h2 id={titleId}>Connect {name}</h2>
            <button type="button" className="mcp-harness__close" onClick={() => dialogRef.current?.close()}>
              Close
            </button>
          </div>
          <p>{MCP_HARNESS_NOTE}</p>
          <div className="mcp-harness__url">
            <code>{url}</code>
            <button type="button" onClick={() => void copyUrl()}>
              Copy URL
            </button>
          </div>
          <ul>
            {links.map((link) => (
              <li key={link.id}>
                <button type="button" onClick={() => choose(link)}>
                  <span>{link.name}</span>
                  <small>{link.detail}</small>
                </button>
              </li>
            ))}
          </ul>
          {note ? <p className="mcp-harness__status">{note}</p> : null}
        </div>
      </dialog>
      <style>{HARNESS_CSS}</style>
    </>
  );
}

const HARNESS_CSS = `
.mcp-harness {
  width: min(32rem, calc(100vw - 2rem));
  max-height: min(40rem, calc(100vh - 2rem));
  padding: 0;
  border: 1px solid var(--glass-edge);
  border-radius: 0;
  background: var(--panel-solid);
  color: var(--fg);
  color-scheme: dark;
  font-family: var(--font-ibm-plex-mono), ui-monospace, SFMono-Regular, Menlo, monospace;
  box-shadow: var(--glass-shadow);
}
.mcp-harness::backdrop { background: rgb(0 0 0 / 0.66); }
.mcp-harness__sheet {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  max-height: min(40rem, calc(100vh - 2rem));
  overflow: auto;
  padding: 1.15rem 1.15rem 1.25rem;
  background:
    linear-gradient(180deg, var(--glass-fill-2), transparent 2.5rem),
    var(--panel-solid);
  color: var(--fg);
}
.mcp-harness__head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.mcp-harness__head h2 {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 500;
  letter-spacing: -0.04em;
  line-height: 1.05;
}
.mcp-harness__close,
.mcp-harness__url button,
.mcp-harness li button { font: inherit; cursor: pointer; }
.mcp-harness__close {
  border: 0;
  background: transparent;
  color: var(--muted);
  text-decoration: underline;
  text-underline-offset: 0.18em;
}
.mcp-harness p { margin: 0; color: var(--muted); font-size: 0.82rem; line-height: 1.45; }
.mcp-harness__url {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.55rem 0.55rem 0.55rem 0.8rem;
  border: 1px solid var(--hair-2);
  background: var(--glass-fill);
}
.mcp-harness__url code { flex: 1; min-width: 0; font-size: 0.78rem; word-break: break-all; color: var(--fg); }
.mcp-harness__url button {
  flex: 0 0 auto;
  border: 0;
  background: var(--accent);
  color: var(--accent-ink);
  padding: 0.45rem 0.75rem;
  font-weight: 600;
}
.mcp-harness ul { display: grid; gap: 0.45rem; margin: 0; padding: 0; list-style: none; }
.mcp-harness li button {
  display: flex;
  width: 100%;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.2rem;
  padding: 0.7rem 0.8rem;
  border: 1px solid var(--hair);
  background: var(--glass-fill);
  color: var(--fg);
  text-align: left;
}
.mcp-harness li button:hover,
.mcp-harness li button:focus-visible { border-color: var(--accent); }
.mcp-harness li span { font-weight: 600; letter-spacing: -0.03em; }
.mcp-harness li small { color: var(--muted); font-size: 0.75rem; line-height: 1.35; }
.mcp-harness__status { color: var(--accent); font-weight: 600; }
`;
