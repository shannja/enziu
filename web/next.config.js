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

  httpAgentOptions: { keepAlive: true },
  experimental: { proxyTimeout: 540_000 },

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
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://sandbox-cdn.paddle.com https://cdn.paddle.com https://cdnjs.cloudflare.com https://public.profitwell.com",
              "script-src-elem 'self' 'unsafe-inline' https://sandbox-cdn.paddle.com https://cdn.paddle.com https://cdnjs.cloudflare.com https://public.profitwell.com",
              "worker-src 'self' blob:",   // ✅ allows PDF.js blob workers
              "frame-src 'self' https://sandbox-buy.paddle.com https://buy.paddle.com",
              "frame-ancestors 'self' https://enziu.vercel.app http://localhost:3000 http://localhost",
              "connect-src 'self' https://sandbox-api.paddle.com https://sandbox-checkout-service.paddle.com https://sandbox-buy.paddle.com https://api.paddle.com https://checkout-service.paddle.com https://buy.paddle.com https://cdn.paddle.com",
              "style-src 'self' 'unsafe-inline' https://sandbox-cdn.paddle.com https://cdn.paddle.com",
              "style-src-elem 'self' 'unsafe-inline' https://sandbox-cdn.paddle.com https://cdn.paddle.com",
              "img-src 'self' data: https://sandbox-cdn.paddle.com https://cdn.paddle.com",
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