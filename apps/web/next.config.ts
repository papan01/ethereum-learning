import path from "node:path";
import { config as loadDotenv } from "dotenv";
import type { NextConfig } from "next";

loadDotenv({ path: path.resolve(process.cwd(), "../../.env") });

const apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3001";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api-proxy/:path*",
        destination: `${apiInternalUrl}/:path*`,
      },
    ];
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@react-native-async-storage/async-storage": false,
      "pino-pretty": false,
    };
    return config;
  },
};

export default nextConfig;
