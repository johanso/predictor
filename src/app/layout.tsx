import type { Metadata } from "next";
import { Oswald, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { RateLimitBadge } from "@/components/RateLimitBadge";
import "./globals.css";

// Condensed, athletic — headings and labels read like stadium signage.
const display = Oswald({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

// Body copy — humanist, easy at small sizes for stat-dense tables.
const body = IBM_Plex_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// Every number in the app (odds, probabilities, scorelines) uses this —
// a scoreboard-digit feel, always tabular.
const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Predictor de Fútbol",
  description: "Predicciones de mercados de fútbol basadas en un modelo de Poisson y estadísticas reales.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <RateLimitBadge />
      </body>
    </html>
  );
}
