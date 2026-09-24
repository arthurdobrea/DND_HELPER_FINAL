import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Компактная сборка для Docker: .next/standalone/server.js
  output: "standalone",
};

export default nextConfig;
