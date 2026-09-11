import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Manuscript uploads (.docx) can exceed Next's 10MB default body limit;
    // matches the 50MB cap enforced in the upload form and API route.
    proxyClientMaxBodySize: "55mb",
  },
};

export default nextConfig;
