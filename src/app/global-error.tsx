"use client";

import { IBM_Plex_Mono } from "next/font/google";
import { Button } from "@/components/site/Button";
import { PageIntro } from "@/components/site/PageIntro";
import { SiteFrame } from "@/components/site/SiteFrame";
import "./globals.css";

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en" className={ibmPlexMono.variable}>
      <body>
        <SiteFrame>
          <main id="content">
            <PageIntro eyebrow="Error" title="labs failed to render.">
              Something went wrong before this page could load. The details stay on the server.
            </PageIntro>
            <div className="hero-actions page-actions">
              <Button onClick={() => retry()}>Try again</Button>
            </div>
          </main>
        </SiteFrame>
      </body>
    </html>
  );
}
