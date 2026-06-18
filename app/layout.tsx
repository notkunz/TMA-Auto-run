import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Rose Gold — VIP TMA Assistant",
  description: "Premium auto-TMA service for NOUN students.",
  manifest: "/manifest.json",
  themeColor: "#eab308",
  openGraph: {
    title: "Rose Gold",
    description: "TMA service for NOUN students.",
    url: "https://rose-gold-two.vercel.app",
    siteName: "Rose Gold",
    images: [
      {
        url: "https://rose-gold-two.vercel.app/og-image.png",
        width: 1200,
        height: 630,
      },
    ],
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
