import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Stagehand ships its Chrome extension + CDP client as Node code; keep it out of the bundle.
  serverExternalPackages: ["@browserbasehq/stagehand", "@browserbasehq/sdk"],
};

export default nextConfig;
