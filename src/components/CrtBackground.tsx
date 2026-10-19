"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import type { FaultyTerminalProps } from "@/components/FaultyTerminal";

/** The same CRT canvas as the Levercoin landing page, behind the signing pages. */
export default function CrtBackground() {
  const path = usePathname();
  // Home and /x use a CSS grid and glow. Load the WebGL canvas only where it is shown.
  const quiet = path === "/" || path === "/x";
  const [Terminal, setTerminal] = useState<ComponentType<FaultyTerminalProps> | null>(null);

  useEffect(() => {
    if (quiet) return;
    let cancelled = false;
    import("@/components/FaultyTerminal").then((mod) => {
      if (!cancelled) setTerminal(() => mod.default);
    });
    return () => {
      cancelled = true;
    };
  }, [quiet]);

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
          />
        </div>
      ) : null}
    </div>
  );
}
