import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "standalone" output is only for Docker/self-hosted — Vercel uses its own runtime
  // output: "standalone",
  reactStrictMode: true,
  // Keep ignoring TS build errors for now — the project has pre-existing
  // issues in example/test files. Should be removed once those are fixed.
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
