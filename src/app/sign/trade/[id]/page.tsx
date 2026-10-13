import { connection } from "next/server";
import { headers } from "next/headers";
import Wordmark from "@/components/Wordmark";
import { SignFacts } from "@/components/SignFacts";
import { siteHost } from "@/lib/config";
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
      <main className="wrap">
        <Wordmark />
        <p>This trade has expired or does not exist.</p>
      </main>
    );
  }
  const expectedHost = siteHost();
  const served =
    requestHost(requestHeaders.get("x-forwarded-host")) ?? requestHost(requestHeaders.get("host"));
  const view = tradeDisclosure(intent, served ?? expectedHost);
  return (
    <main className="wrap">
      <Wordmark />
      <h1>Sign this trade</h1>
      <p className="muted">{view.summary}</p>
      <SignFacts
        caller={view.caller}
        host={view.host}
        expectedHost={expectedHost}
        action={view.action}
        amounts={view.amounts}
        warning={view.warning}
        expiresAt={view.expiresAt}
      />
      <TradeClient id={id} wallet={view.caller} action={intent.action} />
    </main>
  );
}
