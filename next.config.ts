import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Explicitly set the Turbopack workspace root to this project directory
  // so the build system doesn't get confused by the bun.lock in the
  // parent omnis-master-workspace monorepo root.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
