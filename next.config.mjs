/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The app intentionally uses runtime-pasted API keys from the browser (localStorage),
  // proxied through Next.js route handlers. No server env vars are required.
  experimental: {
    // Larger request bodies for audio chunks (WebM opus ~30s can exceed the 1mb default).
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
