import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow phone / LAN / tunnel hosts to load Next dev assets in development.
  allowedDevOrigins: [
    "192.168.1.148",
    "localhost",
    "127.0.0.1",
    "*.trycloudflare.com",
  ],
};

export default nextConfig;
