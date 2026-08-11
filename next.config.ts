import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const configuredSupabaseHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : null;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  basePath,
  ...(process.env.NEXT_PUBLIC_HEAVYUSER_E2E === "1" ? { distDir: ".next-e2e" } : {}),
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co", pathname: "/storage/v1/object/**" },
      { protocol: "https", hostname: "**.supabase.in", pathname: "/storage/v1/object/**" },
      ...(configuredSupabaseHost ? [{ protocol: "https" as const, hostname: configuredSupabaseHost, pathname: "/storage/v1/object/**" }] : []),
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
