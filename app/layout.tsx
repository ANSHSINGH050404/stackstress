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

export const metadata: Metadata = {
  title: "StackStress — Design and stress-test architectures",
  description:
    "Design a system architecture, run traffic through it, and see how queues, latency, and bottlenecks behave under pressure.",
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
