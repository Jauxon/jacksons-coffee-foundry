import "./globals.css";
import "leaflet/dist/leaflet.css";
import type { ReactNode } from "react";
import Script from "next/script";
import { TopChrome } from "../components/TopChrome.tsx";
import { WelcomeModal } from "../components/WelcomeModal.tsx";

// Pin every route to the Node.js runtime — better-sqlite3 + native modules
// can't run on the edge runtime, and the larger memory pool also tends
// to keep instances warm longer.
export const runtime = "nodejs";

// metadataBase makes the auto-generated OG/Twitter image URLs absolute so
// scrapers (iMessage, Slack, LinkedIn, X) can fetch them. Set SITE_URL in the
// runtime env to your public URL (e.g. https://operator.example.com).
export const metadata = {
  metadataBase: process.env.SITE_URL ? new URL(process.env.SITE_URL) : new URL("http://localhost:3000"),
  title: {
    default: "Operator — AI-native ops manager",
    template: "%s · Operator",
  },
  description: "An AI agent that runs a small business and hands every decision to a human for approval. Five competing storefronts on Times Square.",
  applicationName: "Operator",
  openGraph: {
    title: "Operator — an AI-native ops manager",
    description: "A Claude agent runs a business and hands every decision to a human for approval. Five storefronts compete on Times Square.",
    siteName: "Operator",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Operator — an AI-native ops manager",
    description: "A Claude agent runs a business; a human approves every decision. Five storefronts compete on Times Square.",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-cream-50">
        <TopChrome />
        <main className="min-h-[calc(100vh-44px)]">{children}</main>
        <WelcomeModal />
        <Script
          src="https://static.cloudflareinsights.com/beacon.min.js"
          strategy="afterInteractive"
          data-cf-beacon='{"token": "26ed6dac267a4d7b800393ec308daba4"}'
        />
      </body>
    </html>
  );
}
