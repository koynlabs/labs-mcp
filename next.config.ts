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
  // The volume step bundles @lightprotocol/hasher.rs. Its wasm URLs are bare
  // names, so Turbopack cannot find the files in dist/. The build script copies
  // them beside the bundle; this alias covers the same request if a bundle is
  // still unpatched. The trace keeps those files in the workflow function.
  outputFileTracingIncludes: {
    "/.well-known/workflow/**": [
      "./node_modules/@lightprotocol/hasher.rs/dist/**/*.wasm",
    ],
  },
  turbopack: {
    resolveAlias: {
      "light_wasm_hasher_bg.wasm":
        "./node_modules/@lightprotocol/hasher.rs/dist/light_wasm_hasher_bg.wasm",
      "hasher_wasm_simd_bg.wasm":
        "./node_modules/@lightprotocol/hasher.rs/dist/hasher_wasm_simd_bg.wasm",
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: publicHeaders },
      { source: "/sign/:path*", headers: privateHeaders },
      { source: "/api/trade/:path*", headers: privateHeaders },
      { source: "/api/bundle/:path*", headers: privateHeaders },
      { source: "/api/maker/:path*", headers: privateHeaders },
      { source: "/maker/:path*", headers: privateHeaders },
      { source: "/x", headers: privateHeaders },
      // Authenticated X routes. Add new ones here.
      { source: "/api/x/webhook", headers: privateHeaders },
      { source: "/api/x/disconnect", headers: privateHeaders },
      { source: "/api/x/oauth/:path*", headers: privateHeaders },
      { source: "/api/x/media/:path*", headers: privateHeaders },
    ];
  },
};

export default withWorkflow(nextConfig);
