import type { Metadata } from "next";
import LegalNote from "@/components/site/LegalNote";
import SiteChrome from "@/components/site/SiteChrome";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What labs keeps when you sign a transaction or connect X, and what it does not.",
};

export default function PrivacyPage() {
  return (
    <SiteChrome>
      <main id="content" className="legal">
        <LegalNote page="privacy" />
      </main>
    </SiteChrome>
  );
}
