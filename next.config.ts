import { withWorkflow } from "workflow/next";
import type { NextConfig } from "next";

const privateHeaders = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cache-Control", value: "no-store" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/sign/:path*", headers: privateHeaders },
      { source: "/api/trade/:path*", headers: privateHeaders },
      { source: "/api/bundle/:path*", headers: privateHeaders },
      { source: "/api/maker/:path*", headers: privateHeaders },
      { source: "/maker/:path*", headers: privateHeaders },
    ];
  },
};

export default withWorkflow(nextConfig);
