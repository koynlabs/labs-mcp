"use client";

import { Button } from "@/components/site/Button";
import { PageIntro } from "@/components/site/PageIntro";
import { SiteFrame } from "@/components/site/SiteFrame";

export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <SiteFrame>
      <main id="content">
        <PageIntro eyebrow="Error" title="This page failed to render.">
          Something went wrong on this request. The details stay on the server.
        </PageIntro>
        <div className="hero-actions page-actions">
          <Button onClick={() => retry()}>Try again</Button>
          <Button href="/" variant="ghost">
            Back to labs
          </Button>
        </div>
      </main>
    </SiteFrame>
  );
}
