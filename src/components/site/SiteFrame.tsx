"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/site/Button";
import TerminalDoor from "@/components/site/TerminalDoor";
import { KOYNLABS_DISCORD_URL, KOYNLABS_TELEGRAM_URL } from "@/lib/community";
import { GITHUB_REPO_URL } from "@/lib/revision";
import { twitterProfile } from "@/lib/site-twitter";

export function SiteFrame({
  children,
  tape = null,
  version,
  shaShort,
  commitUrl,
  connectHref = "/x",
}: {
  children: ReactNode;
  tape?: ReactNode;
  version?: string;
  shaShort?: string;
  commitUrl?: string;
  connectHref?: string | null;
}) {
  const x = twitterProfile();
  return (
    <div className="mkt">
      <a className="skip" href="#content">
        Skip to content
      </a>
      <div className="mkt-atmo" aria-hidden="true">
        <div className="mkt-glow" />
        <div className="mkt-grid" />
      </div>
      <div className="mkt-top">
        <header className="mkt-bar">
          <Link className="mkt-logo" href="/" aria-label="labs, home">
            &lt; LABS &gt;
          </Link>
          <p className="strip">
            <span className="dot" aria-hidden="true" />
            <span className="ok">live</span>
            {version ? (
              <>
                <span className="sep">·</span>
                <span>{version}</span>
              </>
            ) : null}
            {shaShort && commitUrl ? (
              <>
                <span className="sep">·</span>
                <a href={commitUrl}>{shaShort}</a>
              </>
            ) : null}
            <span className="sep">·</span>
            <Link href="/status">status</Link>
          </p>
          <nav className="mkt-nav" aria-label="Page">
            <a href="/#flow">Flow</a>
            <a href="/#tools">Tools</a>
            <TerminalDoor />
            <a href="https://koyn.trade/trade">DEX</a>
            {connectHref ? (
              <Button href={connectHref} size="sm" variant="ghost">
                Connect X
              </Button>
            ) : null}
          </nav>
        </header>
        {tape}
      </div>
      {children}
      <footer className="mkt-foot">
        <p>
          source <a href={GITHUB_REPO_URL}>github.com/koynlabs/labs-mcp</a>
          {x ? (
            <>
              <span className="sep">·</span>
              <a href={x.url}>x {x.at}</a>
            </>
          ) : null}
          <span className="sep">·</span>
          <a href={KOYNLABS_TELEGRAM_URL}>telegram</a>
          <span className="sep">·</span>
          <a href={KOYNLABS_DISCORD_URL}>discord</a>
          <span className="sep">·</span>
          <Link href="/terms">terms</Link>
          <span className="sep">·</span>
          <Link href="/privacy">privacy</Link>
          <span className="sep">·</span>
          <Link href="/security">security</Link>
        </p>
      </footer>
    </div>
  );
}
