import type { Metadata, Viewport } from "next";
import { Overpass, Overpass_Mono } from "next/font/google";
import "./globals.css";

const overpass = Overpass({
  variable: "--font-overpass",
  subsets: ["latin"],
});

const overpassMono = Overpass_Mono({
  variable: "--font-overpass-mono",
  subsets: ["latin"],
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "StackStress — Design and stress-test architectures",
  description:
    "Design a system architecture, run traffic through it, and see how queues, latency, and bottlenecks behave under pressure.",
  applicationName: "StackStress",
  openGraph: {
    title: "StackStress — Design and stress-test architectures",
    description:
      "Build an executable architecture, break it under a traffic spike, and find the exact rate where it gives out.",
    type: "website",
    siteName: "StackStress",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "StackStress — Design and stress-test architectures",
    description:
      "Build an executable architecture, break it under a traffic spike, and find the exact rate where it gives out.",
  },
};

export const viewport: Viewport = {
  themeColor: "#e8eef2",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${overpass.variable} ${overpassMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
