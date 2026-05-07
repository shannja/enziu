/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  poweredByHeader: false,

  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_URL || 'http://127.0.0.1:8000'}/api/:path*`,
      },
    ];
  },

  // Extend proxy timeout for long-running endpoints (full analysis can take ~5 min).
  // Next.js uses this value (ms) for its internal http-proxy keep-alive timeout.
  httpAgentOptions: {
    keepAlive: true,
  },
  // The canonical way to raise the underlying Node http timeout for rewrites:
  experimental: {
    // proxyTimeout was added in Next.js 14.1 — set to 6 minutes (ms)
    proxyTimeout: 360_000,
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.paddle.com https://sandbox-cdn.paddle.com https://cdnjs.cloudflare.com",
              "frame-src 'self' https://sandbox-buy.paddle.com https://buy.paddle.com https://*.paddle.com",
              "frame-ancestors 'self'",
              "connect-src 'self' https://*.paddle.com https://sandbox-checkout-service.paddle.com",
              "style-src 'self' 'unsafe-inline' https://cdn.paddle.com https://sandbox-cdn.paddle.com",
              "style-src-elem 'self' 'unsafe-inline' https://cdn.paddle.com https://sandbox-cdn.paddle.com",
              "img-src 'self' data: https://*.paddle.com",
              "font-src 'self' data:",
            ].join("; "),
          },
        ],
      },
    ];
  },

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "enziu.vercel.app" },
      { protocol: "https", hostname: "*.enziu.vercel.app" },
    ],
  },
};

module.exports = nextConfig;