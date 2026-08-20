import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "DefenSight — AI Security Defense & Monitoring",
    template: "%s · DefenSight",
  },
  description:
    "Centralised defensive layer for enterprise AI. Monitor AI activity, detect prompt injection and RAG poisoning, enforce guardrails, authorise tool calls and investigate incidents in real time.",
  applicationName: "DefenSight",
};

export const viewport: Viewport = {
  themeColor: "#070a11",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-base text-ink">{children}</body>
    </html>
  );
}
