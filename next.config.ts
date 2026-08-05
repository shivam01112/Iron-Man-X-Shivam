import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    const cachedFrames = {
      key: "Cache-Control",
      value: "public, max-age=604800, stale-while-revalidate=2592000",
    };

    return [
      { source: "/frames/:path*", headers: [cachedFrames] },
      { source: "/frames2/:path*", headers: [cachedFrames] },
      { source: "/frames3/:path*", headers: [cachedFrames] },
    ];
  },
};

export default nextConfig;
