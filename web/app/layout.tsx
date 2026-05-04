import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "@/context/ThemeContext";

const agrandir = localFont({
  src: [
    {
      path: "../public/fonts/agrandir/Agrandir-Regular.otf",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-display",
  display: "swap",
});

const objectSans = localFont({
  src: [
    {
      path: "../public/fonts/objectsans/ObjectSans-Regular.otf",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Enziu - Insurance Policy Analysis",
  description: "Understand what you actually bought. Upload your insurance policy and get instant, plain-English analysis.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${agrandir.variable} ${objectSans.variable} font-body antialiased`}>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}