import SiteChrome from "@/components/site/SiteChrome";
import { MakerClient } from "./maker-client";

export const metadata = {
  title: "Approve quoting",
  robots: { index: false, follow: false },
};

export default async function Page({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return (
    <SiteChrome>
      <main id="content" className="sheet">
        <MakerClient sessionId={sessionId} />
      </main>
    </SiteChrome>
  );
}
