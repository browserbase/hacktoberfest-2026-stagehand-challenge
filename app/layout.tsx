import type { Metadata } from "next";
import { Barlow_Semi_Condensed, Inter, Martian_Mono } from "next/font/google";
import "./globals.css";

// The Hacktoberfest 2026 type system: condensed display, Inter body, Martian Mono for UI labels.
const display = Barlow_Semi_Condensed({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-display" });
const body = Inter({ subsets: ["latin"], variable: "--font-body" });
const mono = Martian_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Errand: a Stagehand web assistant",
  description: "A Muse/Dots-style assistant that acts on the web for you, built on Stagehand v4.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
