/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable React strict mode for better development experience
  reactStrictMode: true,

  // Output standalone for Docker deployments
  output: 'standalone',

  // Remove X-Powered-By header for security
  poweredByHeader: false,

  // API rewrites - proxies /api/* requests to backend
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_URL || 'http://127.0.0.1:8000'}/api/:path*`,
      },
    ];
  },

  // Security headers
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          // X-Frame-Options intentionally omitted — Paddle's checkout renders
          // in an iframe embedded in our page, which DENY would block.
          // frame-ancestors in the CSP below handles this more precisely.
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",

              // Allow our own scripts + Paddle's JS bundle.
              // 'unsafe-eval' is required by Paddle's checkout overlay.
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.paddle.com https://sandbox-cdn.paddle.com",

              // Allow Paddle's checkout iframes to be embedded in our page.
              // Both sandbox and production origins are included so a single
              // config works across environments.
              "frame-src 'self' https://sandbox-buy.paddle.com https://buy.paddle.com https://*.paddle.com",

              // Only allow our own origin to frame us (protects against clickjacking
              // while still letting Paddle's iframe load inside our page).
              "frame-ancestors 'self'",

              // XHR / fetch / WebSocket connections.
              "connect-src 'self' https://*.paddle.com https://sandbox-checkout-service.paddle.com",

              // Inline styles are needed by Next.js and some UI libraries.
              // Paddle's CDN domains are listed here AND in style-src-elem
              // because browsers differ in which directive they consult for
              // <link rel="stylesheet"> — specifying both ensures compatibility.
              "style-src 'self' 'unsafe-inline' https://cdn.paddle.com https://sandbox-cdn.paddle.com",

              // style-src-elem specifically governs <link> stylesheet loading
              // (used by Paddle's addButtonStylesheet). Without this directive
              // the browser falls back to style-src, but once style-src-elem is
              // set it is authoritative and MUST include Paddle's CDN domains.
              "style-src-elem 'self' 'unsafe-inline' https://cdn.paddle.com https://sandbox-cdn.paddle.com",

              "img-src 'self' data: https://*.paddle.com",
              "font-src 'self' data:",
            ].join("; "),
          },
        ],
      },
    ];
  },

  // Images configuration - restricted patterns
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "enziu.vercel.app",
      },
      {
        protocol: "https",
        hostname: "*.enziu.vercel.app",
      },
    ],
  },
};

module.exports = nextConfig;