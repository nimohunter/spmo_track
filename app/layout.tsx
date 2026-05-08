import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SPMO Top 20 Tracker",
  description: "Track Invesco S&P 500 Momentum ETF (SPMO) top 20 holdings over time",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
