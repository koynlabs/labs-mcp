"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { PageIntro } from "@/components/site/PageIntro";

type RiveHandle = {
  resizeDrawingSurfaceToCanvas(): void;
  stateMachineNames: string[];
  play(names: string[]): void;
};

type RiveCtor = new (options: {
  src: string;
  canvas: HTMLCanvasElement;
  autoplay: boolean;
  automaticallyHandleEvents?: boolean;
  onLoad?: () => void;
}) => RiveHandle;

export function DemoClient() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const node = canvas.current;
    if (!node) return;

    const script = document.createElement("script");
    script.src = "https://unpkg.com/@rive-app/canvas@2.31.6/rive.js";
    script.async = true;

    let handle: RiveHandle | null = null;
    const onResize = () => handle?.resizeDrawingSurfaceToCanvas();

    script.onload = () => {
      const Rive = (globalThis as unknown as { rive?: { Rive: RiveCtor } }).rive
        ?.Rive;
      if (!Rive) return;
      handle = new Rive({
        src: "/demo/mcp-tool-chat-demo.riv",
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
    };

    document.body.appendChild(script);
    return () => {
      script.remove();
      removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <>
      <PageIntro eyebrow="Demo" title="Grok bot · MCP chat">
        The Rive file Grok exported for the tool chat. Ask Claude, ChatGPT or Grok to launch, then sign in your own
        wallet.
      </PageIntro>
      <canvas
        ref={canvas}
        width={720}
        height={480}
        className="rive"
        aria-label="Grok bot talking to labs over MCP"
      />
      <p className="panel-note">
        <Link href="/">labs</Link>
        {" · "}
        <a href="https://www.levercoin.lol">$LEVERCOIN</a>
        {" · "}
        <a href="/mcp">MCP</a>
      </p>
    </>
  );
}
