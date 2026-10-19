"use client";

import { useEffect, useState, type ComponentType } from "react";
import type { FaultyTerminalProps } from "@/components/FaultyTerminal";

/**
 * The glitch terminal sits behind every route. Dots paint with the first
 * HTML; the WebGL canvas is loaded after that paint and draws at a capped
 * rate. prefers-reduced-motion keeps a single still frame.
 */
export default function CrtBackground() {
  const [Terminal, setTerminal] = useState<ComponentType<FaultyTerminalProps> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const start = () => {
      if (cancelled) return;
      void import("@/components/FaultyTerminal").then((mod) => {
        if (!cancelled) setTerminal(() => mod.default);
      });
    };
    let idleId: number | undefined;
    let timer: number | undefined;
    const arm = () => {
      if (typeof window.requestIdleCallback === "function") {
        idleId = window.requestIdleCallback(start, { timeout: 1200 });
      } else {
        timer = window.setTimeout(start, 200);
      }
    };
    const paint = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(arm);
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(paint);
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className="crt-bg" aria-hidden="true">
      <div className="crt-bg-dots" />
      {Terminal ? (
        <div className="crt-bg-term">
          <Terminal
            className="faulty-terminal"
            scale={1.2}
            gridMul={[2, 1]}
            digitSize={1.4}
            timeScale={0.25}
            scanlineIntensity={0.45}
            glitchAmount={1.2}
            flickerAmount={0.8}
            noiseAmp={0.7}
            chromaticAberration={0.4}
            curvature={0.12}
            tint="#c8c8c8"
            mouseReact={false}
            mouseStrength={0.15}
            pageLoadAnimation
            brightness={0.55}
            maxFps={30}
          />
        </div>
      ) : null}
      <div className="crt-bg-veil" />
    </div>
  );
}
