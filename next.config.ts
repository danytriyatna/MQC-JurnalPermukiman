import type { NextConfig } from "next";

// Manuscript uploads no longer pass through a request body: the browser puts
// the .docx into Supabase Storage directly and the API only receives its key,
// so the previous `experimental.proxyClientMaxBodySize` override is obsolete.
// It never helped in production either — it raises Next's own buffer limit,
// not Vercel's ~4.5MB serverless function request-body cap.
const nextConfig: NextConfig = {};

export default nextConfig;
