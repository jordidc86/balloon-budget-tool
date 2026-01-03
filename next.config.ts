import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use standalone only if we're not on Netlify
  output: process.env.NETLIFY ? undefined : 'standalone',
  // Ensure we don't fail on warnings during deployment
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
