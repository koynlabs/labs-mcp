import { withWorkflow } from "workflow/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@raydium-io/raydium-sdk-v2"],
};

export default withWorkflow(nextConfig);
