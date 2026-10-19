import type { Metadata } from "next";
import { Button } from "@/components/site/Button";
import { PageIntro } from "@/components/site/PageIntro";
import SiteChrome from "@/components/site/SiteChrome";

export const metadata: Metadata = {
  title: "Not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <SiteChrome>
      <main id="content">
        <PageIntro eyebrow="404" title="That page is not on labs.">
          The address does not match a route. Status lists the commit this deployment is running.
        </PageIntro>
        <div className="hero-actions page-actions">
          <Button href="/">Back to labs</Button>
          <Button href="/status" variant="ghost">
            Status
          </Button>
        </div>
      </main>
    </SiteChrome>
  );
}
