"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { deskPath, hasMint, PENDING, token } from "@/config/token";
import { SITE_URL } from "@/lib/config";
import AsciiWordmark from "./AsciiWordmark";

const BOOT_LINES = [
  { id: "host", text: "labs-terminal 0.9.19" },
  { id: "mount", text: "mounting /dev/launcher ... ok" },
  { id: "mint", text: "mint:" },
  { id: "trade", text: "trade:" },
  { id: "launch", text: "launch:" },
  { id: "agent", text: "agent:" },
] as const;

const LABS_MCP_URL = `${SITE_URL}/mcp`;
const TRADE_MCP_URL = "https://koyn.trade/mcp";

export default function BootSequence({
  onComplete,
  onCopyMint,
}: {
  onComplete: () => void;
  onCopyMint: () => void;
}) {
  const [visible, setVisible] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const [copied, setCopied] = useState(false);
  const finished = useRef(false);
  const desk = deskPath();
  const done = visible >= BOOT_LINES.length;

  useEffect(() => {
    if (done) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = window.setTimeout(() => {
        setSkipped(true);
        setVisible(BOOT_LINES.length);
      }, 0);
      return () => window.clearTimeout(id);
    }
    const skip = () => {
      setSkipped(true);
      setVisible(BOOT_LINES.length);
    };
    window.addEventListener("keydown", skip);
    window.addEventListener("pointerdown", skip);
    return () => {
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
    };
  }, [done]);

  useEffect(() => {
    if (done) {
      const timer = window.setTimeout(
        () => {
          if (finished.current) return;
          finished.current = true;
          onComplete();
        },
        skipped ? 0 : 1400,
      );
      return () => window.clearTimeout(timer);
    }
    const id = window.setTimeout(
      () => {
        setVisible((v) => v + 1);
      },
      visible === 0 ? 0 : 280,
    );
    return () => window.clearTimeout(id);
  }, [visible, done, skipped, onComplete]);

  function copyMint(e: MouseEvent) {
    e.stopPropagation();
    if (!hasMint()) return;
    onCopyMint();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="term-boot">
      {BOOT_LINES.slice(0, visible).map((line, i) => (
        <p key={line.id}>
          <span className="term-dim">[{String(i + 1).padStart(2, "0")}]</span>{" "}
          {line.id === "mint" ? (
            <>
              mint:{" "}
              {hasMint() ? (
                <button type="button" onClick={copyMint} title="copy mint" className="term-ok term-link">
                  {token.mint}
                </button>
              ) : (
                <span className="term-dim">{PENDING}</span>
              )}
              {copied ? <span className="term-dim"> copied</span> : null}
            </>
          ) : line.id === "trade" ? (
            <>
              trade:{" "}
              {desk ? (
                <a href={desk} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="term-link">
                  buy {token.symbol} on the desk
                </a>
              ) : (
                <span className="term-dim">{PENDING}</span>
              )}
            </>
          ) : line.id === "launch" ? (
            <>
              launch:{" "}
              <a href={LABS_MCP_URL} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="term-link">
                {LABS_MCP_URL}
              </a>
            </>
          ) : line.id === "agent" ? (
            <>
              agent:{" "}
              <a href={TRADE_MCP_URL} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="term-link">
                {TRADE_MCP_URL}
              </a>
            </>
          ) : (
            line.text
          )}
        </p>
      ))}
      {visible >= 2 ? <AsciiWordmark /> : null}
      {done ? <p>{`${token.symbol} online. type help, ca, or buy.`}</p> : null}
    </div>
  );
}
