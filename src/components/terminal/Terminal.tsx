"use client";

import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { hasMint, token } from "@/config/token";
import type { Tape } from "@/config/tapes";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BootSequence from "./BootSequence";
import GlyphPlayer, { type GlyphPlayerHandle } from "./GlyphPlayer";
import Heatmap from "./Heatmap";
import { runCommand, type OutputLine } from "./commands";

type HistoryItem =
  | { kind: "boot" }
  | { kind: "input"; text: string }
  | { kind: "output"; lines: OutputLine[] };

const HOST = "labs@koynlabs";

type Stage =
  | { kind: "tape"; tape: Tape; seq: number }
  | { kind: "heatmap" };

function toneClass(tone?: OutputLine["tone"]) {
  switch (tone) {
    case "dim":
      return "term-dim";
    case "accent":
      return "term-accent";
    case "error":
      return "term-err";
    case "ok":
      return "term-ok";
    default:
      return "";
  }
}

export default function Terminal() {
  const router = useRouter();
  const [booted, setBooted] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([{ kind: "boot" }]);
  const [value, setValue] = useState("");
  const [caret, setCaret] = useState(0);
  const [copied, setCopied] = useState(false);
  const [cmdLog, setCmdLog] = useState<string[]>([]);
  const [cmdIndex, setCmdIndex] = useState(-1);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<GlyphPlayerHandle>(null);
  const tapeSeq = useRef(0);
  const [liveTapeSeq, setLiveTapeSeq] = useState(-1);
  const [stage, setStage] = useState<Stage | null>(null);
  const [expanded, setExpanded] = useState(false);

  const finishBoot = useCallback(() => setBooted(true), []);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
    });
  }, []);

  useEffect(() => {
    scrollToEnd();
  }, [history, booted, scrollToEnd]);

  useEffect(() => {
    if (!booted) return;
    if (window.matchMedia("(max-width: 800px)").matches) return;
    inputRef.current?.focus();
  }, [booted]);

  const copyMint = useCallback(async (text?: string) => {
    const payload = (text ?? token.mint).trim();
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }, []);

  const submit = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text) return;

      setCmdLog((prev) => [...prev, text]);
      setCmdIndex(-1);
      setValue("");
      setCaret(0);

      const result = runCommand(text);
      if ("clear" in result) {
        setHistory([]);
        setLiveTapeSeq(-1);
        setStage(null);
        setExpanded(false);
        return;
      }

      if (result.control) {
        const player = playerRef.current;
        const lines: OutputLine[] = player
          ? []
          : [{ text: "no tape is running. type `play`.", tone: "dim" }];
        if (player) {
          if (result.control === "pause") player.togglePause();
          if (result.control === "next") player.next();
          if (result.control === "prev") player.prev();
          if (result.control === "mute") player.toggleMute();
        }
        setHistory((prev) => [
          ...prev,
          { kind: "input", text },
          { kind: "output", lines },
        ]);
        return;
      }

      if (result.ask !== undefined) {
        setHistory((prev) => [
          ...prev,
          { kind: "input", text },
          { kind: "output", lines: [{ text: "…", tone: "dim" }] },
        ]);
        void fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q: result.ask }),
        })
          .then(async (res) => {
            const body = (await res.json()) as { lines?: OutputLine[] };
            const lines =
              body.lines?.length
                ? body.lines
                : [{ text: "no answer.", tone: "error" as const }];
            setHistory((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.kind === "output") {
                next[next.length - 1] = { kind: "output", lines };
              }
              return next;
            });
          })
          .catch(() => {
            setHistory((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.kind === "output") {
                next[next.length - 1] = {
                  kind: "output",
                  lines: [{ text: "ask failed.", tone: "error" }],
                };
              }
              return next;
            });
          });
        return;
      }

      const next: HistoryItem[] = [
        { kind: "input", text },
        { kind: "output", lines: result.lines },
      ];
      if (result.showHeatmap) setStage({ kind: "heatmap" });
      if (result.playTape) {
        const seq = ++tapeSeq.current;
        setStage({ kind: "tape", tape: result.playTape, seq });
        setLiveTapeSeq(seq);
      }
      setHistory((prev) => [...prev, ...next]);

      if (result.copied) void copyMint(result.copied);
      if (result.openUrl) window.open(result.openUrl, "_blank", "noopener,noreferrer");
      if (result.navigate) router.push(result.navigate);
    },
    [copyMint, router],
  );

  const closeStage = useCallback(() => {
    setStage(null);
    setExpanded(false);
    setLiveTapeSeq(-1);
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!stage) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (expanded) {
        setExpanded(false);
        inputRef.current?.focus();
        return;
      }
      closeStage();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, expanded, closeStage]);

  // Same rule as before the redesign: an empty prompt drives the live tape.
  // The listener is on window so n/p still work after a click moves focus onto
  // the video. A command already in the prompt, or any other field, is left alone.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (value !== "" || liveTapeSeq < 0 || !playerRef.current) return;
      const target = e.target;
      if (target instanceof HTMLElement && target !== inputRef.current) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;
      }
      const k = e.key === " " ? "space" : e.key.toLowerCase();
      if (k !== "space" && k !== "n" && k !== "p" && k !== "m") return;
      e.preventDefault();
      const player = playerRef.current;
      if (k === "space") player.togglePause();
      if (k === "n") player.next();
      if (k === "p") player.prev();
      if (k === "m") player.toggleMute();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [value, liveTapeSeq]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit(value);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit(value);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!cmdLog.length) return;
      const next = cmdIndex < 0 ? cmdLog.length - 1 : Math.max(0, cmdIndex - 1);
      setCmdIndex(next);
      const recalled = cmdLog[next] ?? "";
      setValue(recalled);
      setCaret(recalled.length);
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (cmdIndex < 0) return;
      const next = cmdIndex + 1;
      if (next >= cmdLog.length) {
        setCmdIndex(-1);
        setValue("");
        setCaret(0);
      } else {
        setCmdIndex(next);
        const recalled = cmdLog[next] ?? "";
        setValue(recalled);
        setCaret(recalled.length);
      }
    }
    if (e.key === "Tab") {
      e.preventDefault();
    }
  }

  return (
    <section
      className={expanded ? "term-shell is-expanded" : "term-shell"}
      aria-label="koyn-terminal"
      onClick={() => inputRef.current?.focus()}
    >
      <div className="term-bar">
        <span className="term-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span>koyn-terminal</span>
        <span className="term-host">{HOST}</span>
        <button
          type="button"
          className="term-copy"
          disabled={!hasMint()}
          onClick={(e) => {
            e.stopPropagation();
            void copyMint();
          }}
        >
          {copied ? "copied" : hasMint() ? "copy ca" : "pending"}
        </button>
      </div>

      <div className="term-body">
      {expanded ? null : (
      <div className="term-main">
      <div ref={scroller} className="term-scroll">
        {history.map((item, i) => {
          if (item.kind === "boot") {
            return (
              <BootSequence
                key="boot"
                onComplete={finishBoot}
                onCopyMint={() => void copyMint()}
              />
            );
          }
          if (item.kind === "input") {
            return (
              <p key={`${i}-in`} className="term-input">
                <span className="term-dim">{HOST}</span>
                <span className="term-dim">:</span>
                <span>~</span>
                <span className="term-dim">$ </span>
                {item.text}
              </p>
            );
          }
          return (
            <div key={`${i}-out`} className="term-out">
              {item.lines.map((line, j) => (
                <p key={j} className={toneClass(line.tone)}>
                  {line.href ? (
                    <Link
                      href={line.href}
                      onClick={(e) => e.stopPropagation()}
                      className="term-link"
                    >
                      {line.text}
                    </Link>
                  ) : (
                    line.text || "\u00a0"
                  )}
                </p>
              ))}
            </div>
          );
        })}

        {booted ? (
          <form onSubmit={onSubmit} className="term-prompt">
            <span className="term-dim">{HOST}</span>
            <span className="term-dim">:</span>
            <span>~</span>
            <span className="term-dim">$</span>
            <span className="term-entry">
              <span className="term-echo" aria-hidden="true">
                {value.slice(0, caret)}
                <span className="term-blink">█</span>
                {value.slice(caret)}
              </span>
              <input
                ref={inputRef}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setCaret(e.target.selectionStart ?? e.target.value.length);
                }}
                onKeyDown={onKeyDown}
                onKeyUp={(e) => setCaret(e.currentTarget.selectionStart ?? value.length)}
                onClick={(e) => setCaret(e.currentTarget.selectionStart ?? value.length)}
                onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? value.length)}
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                aria-label="terminal command"
              />
            </span>
          </form>
        ) : null}
      </div>
      </div>
      )}

      {stage ? (
        <aside className={expanded ? "term-stage is-full" : "term-stage"} onClick={(e) => e.stopPropagation()}>
          <div className="term-stage-bar">
            <span className="term-stage-name">
              {stage.kind === "heatmap" ? "heatmap" : `/dev/brainrot/${stage.tape.id}`}
            </span>
            <div className="term-stage-actions">
              <button type="button" onClick={() => setExpanded((open) => !open)}>
                {expanded ? "split" : "full"}
              </button>
              <button type="button" onClick={closeStage}>
                close
              </button>
            </div>
          </div>
          <div className="term-stage-body">
            {stage.kind === "heatmap" ? <Heatmap /> : null}
            {stage.kind === "tape" ? (
              <GlyphPlayer key={`tape-${stage.seq}`} ref={playerRef} tape={stage.tape} live />
            ) : null}
          </div>
        </aside>
      ) : null}
      </div>
    </section>
  );
}
