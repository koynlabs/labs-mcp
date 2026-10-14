import { ImageResponse } from "next/og";

export const MARK_SIZE = { width: 180, height: 180 };

/** Square "lb" mark. Same drawing as the apple touch icon, as a PNG response. */
export function labsMarkResponse() {
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
    { ...MARK_SIZE },
  );
}
