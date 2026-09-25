"use client";

import dynamic from "next/dynamic";

const FaultyTerminal = dynamic(() => import("@/components/FaultyTerminal"), {
  ssr: false,
});

/** The same CRT canvas as the Levercoin landing page, behind the page content. */
export default function CrtBackground() {
  return (
    <div className="crt-bg" aria-hidden="true">
      <div className="crt-bg-dots" />
      <div className="crt-bg-term">
        <FaultyTerminal
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
    </div>
  );
}
