import { connection } from "next/server";
import { headers } from "next/headers";
import { PageIntro } from "@/components/site/PageIntro";
import SiteChrome from "@/components/site/SiteChrome";
import { SOLANA_RPC, siteHost } from "@/lib/config";
import { tradeDisclosure } from "@/lib/trade/disclosure";
import { loadTrade, tradeExpired } from "@/lib/trade/intent";
import { TradeClient } from "./trade-client";

export const metadata = {
  title: "Sign a trade",
  robots: { index: false, follow: false },
};

function requestHost(value: string | null): string | null {
  let first = value?.split(",")[0]?.trim().toLowerCase() ?? "";
  if (!first || first.length > 255 || /[\s/]/.test(first)) return null;
  first = first.replace(/:443$/, "").replace(/:80$/, "");
  return first;
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const requestHeaders = await headers();
  const intent = await loadTrade(id);
  if (!intent || tradeExpired(intent)) {
    return (
      <SiteChrome>
        <main id="content" className="sheet">
          <PageIntro eyebrow="Trade" title="This trade has expired or does not exist.">
            Ask the assistant for a new signing link.
          </PageIntro>
        </main>
      </SiteChrome>
    );
  }
  const expectedHost = siteHost();
  const served =
    requestHost(requestHeaders.get("x-forwarded-host")) ?? requestHost(requestHeaders.get("host"));
  const view = tradeDisclosure(intent, served ?? expectedHost);
  return (
    <SiteChrome>
      <main id="content" className="sheet">
      <TradeClient
        id={id}
        wallet={view.caller}
        action={intent.action}
        cluster={SOLANA_RPC.includes("devnet") ? "devnet" : "mainnet"}
        summary={view.summary}
        host={view.host}
        expectedHost={expectedHost}
        actionLabel={view.action}
        amounts={view.amounts}
        warning={view.warning}
        expiresAt={view.expiresAt}
      />
      </main>
    </SiteChrome>
  );
}
