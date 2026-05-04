import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "ENZIU — Insurance Transparency Engine",
  description:
    "Upload your insurance policy and get instant clarity. Scored, cited, plain English analysis — zero data stored.",
  keywords: [
    "insurance",
    "policy analysis",
    "transparency",
    "AI",
    "document review",
  ],
  authors: [{ name: "ENZIU" }],
  openGraph: {
    title: "ENZIU — Insurance Transparency Engine",
    description:
      "Upload your insurance policy and get instant clarity. Scored, cited, plain English analysis.",
    type: "website",
    locale: "en_US",
    url: "https://enziu.ai",
    siteName: "ENZIU",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "ENZIU — Insurance Transparency Engine",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ENZIU — Insurance Transparency Engine",
    description:
      "Upload your insurance policy and get instant clarity. Scored, cited, plain English analysis.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} font-sans antialiased bg-black text-white`}
      >
        {/* Session cleanup on tab close */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.addEventListener('beforeunload', function() {
                // Clear session data when tab closes
                if (confirm('End your ENZIU session? All data will be permanently deleted.')) {
                  localStorage.removeItem('enziu_session');
                  sessionStorage.clear();
                  // Notify server to wipe session
                  fetch('/api/session/end', { method: 'POST', keepalive: true });
                }
              });
            `,
          }}
        />
        {children}
      </body>
    </html>
  );
}