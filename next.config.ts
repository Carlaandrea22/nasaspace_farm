import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
    ];
  },
};

export default config;
