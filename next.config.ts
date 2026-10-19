import { withWorkflow } from "workflow/next";
import type { NextConfig } from "next";

const privateHeaders = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cache-Control", value: "no-store" },
  { key: "X-Content-Type-Options", value: "nosniff" },
];

const publicHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: publicHeaders },
      { source: "/sign/:path*", headers: privateHeaders },
      { source: "/api/trade/:path*", headers: privateHeaders },
      { source: "/api/bundle/:path*", headers: privateHeaders },
      { source: "/api/maker/:path*", headers: privateHeaders },
      { source: "/maker/:path*", headers: privateHeaders },
      { source: "/x", headers: privateHeaders },
      { source: "/api/x/:path*", headers: privateHeaders },
    ];
  },
};

export default withWorkflow(nextConfig);
