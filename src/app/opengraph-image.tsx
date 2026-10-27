import { ImageResponse } from "next/og";

export const alt = "labs — launch a token and announce it on X";
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
          backgroundColor: "#04050f",
          color: "#f4f4f5",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        }}
      >
        <div style={{ height: 6, width: "100%", backgroundColor: "#4ade80" }} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            flex: 1,
            padding: "52px 64px 56px",
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
            <div style={{ fontSize: 68, lineHeight: 1.05, letterSpacing: -1, fontWeight: 600 }}>
              Launch a token.
            </div>
            <div style={{ fontSize: 68, lineHeight: 1.05, letterSpacing: -1, fontWeight: 600, color: "#4ade80" }}>
              Announce it on X.
            </div>
            <div style={{ marginTop: 28, fontSize: 28, color: "#d4d4d8", maxWidth: 920 }}>
              pump.fun or StonkFun, from one assistant. Your wallet signs. A post goes out only after you confirm.
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, color: "#a1a1aa" }}>
            <span>labs@solana:~$</span>
            <span>labs.koyn.trade/mcp</span>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
