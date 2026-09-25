import { ImageResponse } from "next/og";
import { FEE_SOL } from "@/lib/config";
import { HOLD_WAIVES_FEE } from "@/lib/site";

export const alt = "labs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#070708",
          color: "#f4f4f5",
          padding: "56px 64px",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 22,
            letterSpacing: 4,
            color: "#a1a1aa",
          }}
        >
          <span>&lt; labs &gt;</span>
          <span>MCP</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 120,
              letterSpacing: 16,
              fontWeight: 700,
              color: "#fafafa",
            }}
          >
            LABS
          </div>
          <div
            style={{
              marginTop: 16,
              fontSize: 28,
              letterSpacing: 2,
              color: "#d4d4d8",
            }}
          >
            {HOLD_WAIVES_FEE
              ? `Launch on pump.fun or StonkFun. ${FEE_SOL} SOL, or free holding $LEVERCOIN.`
              : `Launch on pump.fun or StonkFun. ${FEE_SOL} SOL. Your wallet signs.`}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 20,
            letterSpacing: 2,
            color: "#71717a",
          }}
        >
          <span>labs@solana:~$</span>
          <span>labs.levercoin.lol/mcp</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
