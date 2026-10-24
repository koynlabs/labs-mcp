"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Terminal from "@/components/terminal/Terminal";

function clearHash() {
  if (window.location.hash === "#terminal") {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

export default function TerminalDoor() {
  const opener = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  const show = useCallback(() => setOpen(true), []);

  useEffect(() => {
    const sync = () => {
      if (window.location.hash === "#terminal") setOpen(true);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  useEffect(() => {
    const node = dialog.current;
    if (!open || !node) return;
    if (!node.open) node.showModal();
    node.querySelector<HTMLButtonElement>(".land-term-close")?.focus();

    const finish = () => {
      clearHash();
      setOpen(false);
      opener.current?.focus();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") node.close();
    };
    node.addEventListener("close", finish);
    window.addEventListener("keydown", onKey);
    return () => {
      node.removeEventListener("close", finish);
      window.removeEventListener("keydown", onKey);
      if (node.open) node.close();
    };
  }, [open]);

  return (
    <>
      <button ref={opener} type="button" className="land-term-open" onClick={show}>
        terminal
      </button>
      {open ? (
        <dialog
          ref={dialog}
          className="land-term-dialog"
          aria-labelledby="term-dialog-title"
          onClick={(event) => {
            if (event.target === dialog.current) dialog.current?.close();
          }}
        >
          <div className="land-term-chrome">
            <p id="term-dialog-title">Terminal</p>
            <button type="button" className="land-term-close" onClick={() => dialog.current?.close()}>
              Close
            </button>
          </div>
          <Terminal />
        </dialog>
      ) : null}
    </>
  );
}
