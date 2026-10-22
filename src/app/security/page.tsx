import type { Metadata } from "next";
import { Button } from "@/components/site/Button";
import { CodeBlock } from "@/components/site/CodeBlock";
import { PageIntro } from "@/components/site/PageIntro";
import { Panel } from "@/components/site/Panel";
import SiteChrome from "@/components/site/SiteChrome";
import { GITHUB_REPO_URL } from "@/lib/revision";

export const metadata: Metadata = {
  title: "Security",
  description:
    "How labs handles wallet keys, mint keys, and X tokens, and how to report a problem.",
};

export default function SecurityPage() {
  return (
    <SiteChrome>
      <main id="content">
        <PageIntro eyebrow="Security" title="labs never asks for a wallet private key.">
          Report anything that would let the server move funds, serve a different binary than the published source, or
          leak a secret. Email dev@koyn.trade. Do not open a public issue.
        </PageIntro>

        <div className="hero-actions page-actions">
          <Button href="mailto:dev@koyn.trade">Email dev@koyn.trade</Button>
          <Button href="/.well-known/security.txt" variant="ghost">
            security.txt
          </Button>
          <Button href={`${GITHUB_REPO_URL}/blob/main/SECURITY.md`} variant="ghost">
            Policy
          </Button>
        </div>

        <div className="trust-grid">
          <Panel title="Wallet">
            <p>
              Your wallet signs every transaction. That signature is what authorises the launch, the trade, and the
              perp. labs does not ask for the private key.
            </p>
          </Panel>
          <Panel title="Mint">
            <p>
              A launch generates a mint keypair, seals it with <code>LABS_SESSION_SECRET</code>, and uses it only to
              co-sign the create after the creator&apos;s wallet has signed. That key holds no funds.
            </p>
          </Panel>
          <Panel title="X tokens">
            <p>
              An X connection seals the account&apos;s access and refresh tokens with <code>X_TOKEN_ENCRYPTION_KEY</code>
              , or with <code>X_CLIENT_SECRET</code> when that key is unset. Each connection has a personal key, stored
              only as a hash.
            </p>
          </Panel>
          <Panel title="What to report">
            <p>
              Anything that would let the server move funds, serve a different binary than{" "}
              <a href={GITHUB_REPO_URL}>github.com/koynlabs/labs-mcp</a>, or leak <code>LABS_PINATA_JWT</code>,{" "}
              <code>LABS_SESSION_SECRET</code>, a personal X key, <code>X_CLIENT_SECRET</code>,{" "}
              <code>X_CONSUMER_SECRET</code>, <code>X_TOKEN_ENCRYPTION_KEY</code>, or Redis credentials.
            </p>
          </Panel>
        </div>

        <section className="band" aria-labelledby="mcp-auth-title">
          <header className="section-head">
            <p className="eyebrow">MCP</p>
            <h2 id="mcp-auth-title">Personal key</h2>
            <p>
              The public MCP endpoint requires this header before any X tool or <code>/api/x/media</code> upload runs.
              A key acts only as the X account that created it.
            </p>
          </header>
          <CodeBlock label="Authorization header" value="Authorization: Bearer <personal key>" />
        </section>

        <section className="band" aria-labelledby="domain-title">
          <header className="section-head">
            <p className="eyebrow">Wallets</p>
            <h2 id="domain-title">Wallet domain review</h2>
            <p>
              Phantom shows &quot;this domain is new&quot; on its own until the domain has been reviewed, and
              &quot;this dApp could be malicious&quot; when it cannot simulate the transaction. Simulation is fixed in
              the app. The new-domain warning is cleared by Phantom and Blowfish.
            </p>
          </header>
          <ol className="steps">
            <li>
              <span className="step-num">01</span>
              <h3>security.txt</h3>
              <p>
                Confirm <a href="https://labs.koyn.trade/.well-known/security.txt">security.txt</a> resolves and
                names this repository.
              </p>
            </li>
            <li>
              <span className="step-num">02</span>
              <h3>Phantom</h3>
              <p>
                If the new-domain warning is still there after a week, submit{" "}
                <a href="https://docs.google.com/forms/d/1JgIxdmolgh_80xMfQKBKx9-QPC7LRdN6LHpFFW8BlKM/viewform">
                  Phantom&apos;s domain review form
                </a>
                . Include the domain, what the signer is authorising (a pump.fun or StonkFun create, plus the
                creator&apos;s own buy), the public GitHub repo, and a link to a sign page whose simulation succeeds.
              </p>
            </li>
            <li>
              <span className="step-num">03</span>
              <h3>Blowfish</h3>
              <p>
                Email <a href="mailto:review@blowfish.xyz">review@blowfish.xyz</a> with the same packet. Blowfish is
                the scanner behind Phantom&apos;s malicious-dApp warning.
              </p>
            </li>
            <li>
              <span className="step-num">04</span>
              <h3>Signing</h3>
              <p>
                Multi-signer launches stay on <code>signTransaction</code>. The wallet signs first. The mint key
                co-signs after. Do not switch them to <code>signAndSendTransaction</code>. Warnings docs:{" "}
                <a href="https://docs.phantom.com/developer-powertools/domain-and-transaction-warnings">
                  Domain and transaction warnings
                </a>
                .
              </p>
            </li>
          </ol>
        </section>

        <p className="panel-note">
          Production is https://labs.koyn.trade. The version in the header carries the git SHA of that deploy (
          <code>1.0.0+&lt;shortsha&gt;</code>). Match it to a commit on main.
        </p>
      </main>
    </SiteChrome>
  );
}
