import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import CrtBackground from "@/components/CrtBackground";
import JsonLd from "@/components/JsonLd";
import { SITE } from "@/lib/site";
import "./globals.css";

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: SITE.title,
    template: `%s · ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: [
    "labs",
    "Levercoin",
    "pump.fun",
    "StonkFun",
    "Solana",
    "MCP",
    "token launch",
  ],
  authors: [{ name: "Levercoin" }],
  creator: "Levercoin",
  publisher: "Levercoin",
  category: "cryptocurrency",
  alternates: { canonical: SITE.url },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  openGraph: {
    type: "website",
    locale: SITE.locale,
    url: SITE.url,
    siteName: SITE.name,
    title: SITE.title,
    description: SITE.ogDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.title,
    description: SITE.ogDescription,
  },
  other: { "theme-color": "#070708" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${ibmPlexMono.variable} h-full antialiased`}>
      <body>
        <JsonLd />
        <CrtBackground />
        {children}
        <div className="crt-scanlines" aria-hidden="true" />
      </body>
    </html>
  );
}
