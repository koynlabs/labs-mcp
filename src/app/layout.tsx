import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import CrtBackground from "@/components/CrtBackground";
import "./globals.css";

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "labs",
  description:
    "Launch tokens on pump.fun and StonkFun from Claude, ChatGPT or Grok. Your wallet signs everything.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${ibmPlexMono.variable} h-full antialiased`}>
      <body>
        <CrtBackground />
        {children}
        <div className="crt-scanlines" aria-hidden="true" />
      </body>
    </html>
  );
}
