import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "@/context/ThemeContext";
import { ModeProvider } from "@/context/ModeContext";

const agrandir = localFont({
  src: [
    {
      path: "../public/fonts/agrandir/Agrandir-Regular.otf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/agrandir/Agrandir-TextBold.otf",
      weight: "700",
      style: "bold",
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
  icons: {
    icon: '/logos/mark.png',
    apple: '/logos/mark.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${agrandir.variable} ${objectSans.variable} font-body antialiased`}>
        <ModeProvider>
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </ModeProvider>
      </body>
    </html>
  );
}