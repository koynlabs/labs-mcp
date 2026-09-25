import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#070708",
          color: "#fafafa",
          fontSize: 64,
          fontWeight: 700,
          letterSpacing: 2,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          border: "8px solid #f4f4f5",
        }}
      >
        lb
      </div>
    ),
    { ...size },
  );
}
