import type { ReactNode } from "react";
import { SiteFrame } from "@/components/site/SiteFrame";
import { APP_VERSION, GITHUB_COMMIT_URL, GIT_SHA_SHORT } from "@/lib/revision";

export default function SiteChrome({
  children,
  connectHref = "/x",
}: {
  children: ReactNode;
  connectHref?: string | null;
}) {
  return (
    <SiteFrame
      version={APP_VERSION}
      shaShort={GIT_SHA_SHORT || undefined}
      commitUrl={GIT_SHA_SHORT ? GITHUB_COMMIT_URL : undefined}
      connectHref={connectHref}
    >
      {children}
    </SiteFrame>
  );
}
