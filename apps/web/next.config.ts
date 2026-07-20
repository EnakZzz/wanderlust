import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  transpilePackages: ["@wanderlust/domain"]
};

export default nextConfig;
