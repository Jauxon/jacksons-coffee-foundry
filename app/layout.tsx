import "./globals.css";
import "leaflet/dist/leaflet.css";
import type { ReactNode } from "react";
import { TopChrome } from "../components/TopChrome.tsx";
import { WelcomeModal } from "../components/WelcomeModal.tsx";

// Pin every route to the Node.js runtime — better-sqlite3 + native modules
// can't run on Vercel's edge runtime, and the larger memory pool also tends
// to keep instances warm longer (which preserves the in-memory DB).
export const runtime = "nodejs";

export const metadata = {
  title: "Jackson's Coffee Foundry",
  description: "Foundry-style FDE workflow for a five-team coffee shop competition on Times Square",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-cream-50">
        <TopChrome />
        <main className="min-h-[calc(100vh-44px)]">{children}</main>
        <WelcomeModal />
      </body>
    </html>
  );
}
