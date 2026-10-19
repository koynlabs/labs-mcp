import SiteChrome from "@/components/site/SiteChrome";
import { DemoClient } from "./demo-client";

export const metadata = {
  title: "Grok bot demo",
  description: "The Rive file Grok exported for the labs MCP chat.",
};

export default function Page() {
  return (
    <SiteChrome>
      <main id="content" className="sheet">
        <DemoClient />
      </main>
    </SiteChrome>
  );
}
