import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Lets a layout call forbidden() to answer 403 (the Speech Lab pages do,
    // for any account that is not a researcher).
    authInterrupts: true,
  },
};

export default nextConfig;
