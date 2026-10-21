import type { Metadata } from "next";
import LegalNote from "@/components/site/LegalNote";
import SiteChrome from "@/components/site/SiteChrome";

export const metadata: Metadata = {
  title: "Terms",
  description: "How labs launches, trades, and posts, and what you confirm before anything goes out.",
};

export default function TermsPage() {
  return (
    <SiteChrome>
      <main id="content" className="legal">
        <LegalNote page="terms" />
      </main>
    </SiteChrome>
  );
}
