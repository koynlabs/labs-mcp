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
      // Private X routes only. /api/x/trends is the public homepage strip:
      // no-store on that path would override s-maxage and every visitor would
      // hit origin. Add new authenticated /api/x routes here.
      { source: "/api/x/webhook", headers: privateHeaders },
      { source: "/api/x/disconnect", headers: privateHeaders },
      { source: "/api/x/oauth/:path*", headers: privateHeaders },
      { source: "/api/x/media/:path*", headers: privateHeaders },
    ];
  },
};

export default withWorkflow(nextConfig);
