"use client";

import Link from "next/link";
import GrokRive from "@/components/site/GrokRive";
import { PageIntro } from "@/components/site/PageIntro";
import { KOYN_DESK_URL } from "@/lib/koyn";

export function DemoClient() {
  return (
    <>
      <PageIntro eyebrow="Demo" title="Grok bot · MCP chat">
        The Rive file Grok exported for the tool chat. Ask Claude, ChatGPT or Grok to launch, then sign in your own
        wallet.
      </PageIntro>
      <GrokRive />
      <p className="panel-note">
        <Link href="/">labs</Link>
        {" · "}
        <a href={KOYN_DESK_URL}>KOYN desk</a>
        {" · "}
        <a href="/mcp">MCP</a>
      </p>
    </>
  );
}
