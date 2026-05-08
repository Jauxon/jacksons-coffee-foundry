import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module — must run only on the server, never bundled
  serverExternalPackages: ["better-sqlite3"],
  // Include the migrations + .env files in the serverless function bundle so
  // db/client.ts can find them at cold-start time on Vercel.
  outputFileTracingIncludes: {
    "/**": ["./db/migrations/**/*"],
  },
};

export default nextConfig;
