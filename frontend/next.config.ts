import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

// Production is a static export served by FastAPI on the same origin. The dev server
// has no API of its own, so it proxies /api to the backend on port 8000 instead.
export default function nextConfig(phase: string): NextConfig {
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    return { rewrites: async () => [{ source: "/api/:path*", destination: "http://localhost:8000/api/:path*" }] };
  }
  return { output: "export" };
}
