"use client";

import { useEffect, useRef } from "react";

type RiveHandle = {
  resizeDrawingSurfaceToCanvas(): void;
  stateMachineNames: string[];
  play(names: string[]): void;
  cleanup?: () => void;
};

type RiveCtor = new (options: {
  src: string;
  canvas: HTMLCanvasElement;
  autoplay: boolean;
  automaticallyHandleEvents?: boolean;
  onLoad?: () => void;
}) => RiveHandle;

const RUNTIME = "https://unpkg.com/@rive-app/canvas@2.31.6/rive.js";
const FILE = "/demo/mcp-tool-chat-demo.riv";

let runtime: Promise<RiveCtor | null> | null = null;

/** The runtime loads once per page; every mount after the first reuses it. */
function loadRuntime(): Promise<RiveCtor | null> {
  if (runtime) return runtime;
  runtime = new Promise((resolve) => {
    const found = () => (globalThis as unknown as { rive?: { Rive: RiveCtor } }).rive?.Rive ?? null;
    if (found()) return resolve(found());
    const script = document.createElement("script");
    script.src = RUNTIME;
    script.async = true;
    script.onload = () => resolve(found());
    script.onerror = () => resolve(null);
    document.body.appendChild(script);
  });
  return runtime;
}

/**
 * The Grok face Grok exported for the tool chat. The demo page is the only place it mounts.
 */
export default function GrokRive({ className = "rive", label = "Grok bot talking to labs over MCP" }: { className?: string; label?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    let handle: RiveHandle | null = null;
    let gone = false;
    const onResize = () => handle?.resizeDrawingSurfaceToCanvas();
    void loadRuntime().then((Rive) => {
      if (!Rive || gone) return;
      handle = new Rive({
        src: FILE,
        canvas: node,
        autoplay: true,
        automaticallyHandleEvents: true,
        onLoad() {
          handle?.resizeDrawingSurfaceToCanvas();
          const machines = handle?.stateMachineNames ?? [];
          if (machines.length) handle?.play(machines);
        },
      });
      addEventListener("resize", onResize);
    });
    return () => {
      gone = true;
      removeEventListener("resize", onResize);
      handle?.cleanup?.();
    };
  }, []);

  return <canvas ref={canvas} width={720} height={480} className={className} aria-label={label} />;
}
