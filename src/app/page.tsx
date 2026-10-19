import Link from "next/link";
import Wordmark from "@/components/Wordmark";
import CopyField from "@/components/site/CopyField";
import LaunchTranscript from "@/components/site/LaunchTranscript";
import SiteChrome from "@/components/site/SiteChrome";
import { LaunchIcon, MakerIcon, PerpsIcon, TradeIcon, XIcon } from "@/components/site/icons";
import { SITE_URL } from "@/lib/config";
import { GITHUB_REPO_URL } from "@/lib/revision";

const MCP_URL = `${SITE_URL}/mcp`;

const STEPS = [
  {
    n: "01",
    title: "Build",
    text: "Metadata, the create, and opening buys from up to three wallets you control, in one bundle.",
  },
  { n: "02", title: "Sign", text: "Your wallet signs. labs does not hold that key." },
  { n: "03", title: "Lands", text: "The assistant checks who signed and whether the bundle landed." },
  { n: "04", title: "Draft", text: "The assistant drafts the announcement as your X account, with art or an MP4." },
  { n: "05", title: "Confirm", text: "You confirm that exact text and media. Nothing is posted before this." },
  { n: "06", title: "Live on X", text: "The draft goes live on your account." },
  {
    n: "07",
    title: "Replies",
    text: "Mentions come in. The assistant drafts replies on those threads. Replies are capped. Nothing replies on its own.",
  },
];

export default function Home() {
  return (
    <SiteChrome>
      {/* Build-time values only: this page is prerendered, and reading request
          state or a store here would silently make it dynamic. */}
      <main id="content">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <Wordmark />
            <p className="eyebrow">Launch · trade · post</p>
            <h1 id="hero-title">
              Launch a token on pump.fun or StonkFun, trade it, and announce it on your X account.
            </h1>
            <p className="lede">
              From one conversation. Connect labs to Claude, ChatGPT or Grok. The assistant builds the launch and
              returns a link where your wallet signs. With your own X account connected, that same assistant drafts
              the announcement — text, an image, or an MP4 — and posts it only after you confirm the preview. There
              is no launch fee and no subscription.
            </p>
            <div className="hero-actions">
              <a className="btn btn-primary" href="#connect">
                Add the MCP
              </a>
              <Link className="btn btn-ghost" href="/x">
                Connect X
              </Link>
            </div>
          </div>
          <LaunchTranscript />
        </section>

        <section id="flow" className="band" aria-labelledby="flow-title">
          <header className="section-head">
            <p className="eyebrow">Pipeline</p>
            <h2 id="flow-title">How a launch goes</h2>
            <p>One assistant, from the create to the post. X is a step in that pipeline.</p>
          </header>
          <ol className="steps">
            {STEPS.map((step) => (
              <li key={step.n}>
                <span className="step-num">{step.n}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="tools" className="band" aria-labelledby="tools-title">
          <header className="section-head">
            <p className="eyebrow">Capabilities</p>
            <h2 id="tools-title">Tools</h2>
            <p>The same MCP. Grouped by what the assistant can actually do.</p>
          </header>
          <div className="cards">
            <article className="card card-launch">
              <div className="card-kicker">
                <span className="card-icon">
                  <LaunchIcon />
                </span>
                <h3>Launch</h3>
              </div>
              <ul className="tool-lines">
                <li>
                  <code>launch_token</code>
                  <span>Build a launch and get a signing link.</span>
                </li>
                <li>
                  <code>launch_status</code>
                  <span>Who still has to sign, and whether it landed.</span>
                </li>
                <li>
                  <code>token_info</code>
                  <span>Price, market cap, liquidity, holders.</span>
                </li>
                <li>
                  <code>wallet_balance</code>
                  <span>SOL balance, so a launch can be sized before signing.</span>
                </li>
                <li>
                  <code>pump_pairs</code>
                  <span>Quote mints a pump.fun launch can trade against.</span>
                </li>
                <li>
                  <code>stonks_pairs</code>
                  <span>Quote mints a StonkFun launch can trade against.</span>
                </li>
              </ul>
            </article>

            <article className="card card-x">
              <div className="card-kicker">
                <span className="card-icon">
                  <XIcon />
                </span>
                <h3>X</h3>
              </div>
              <ul className="tool-lines">
                <li>
                  <code>x_connect_link</code>
                  <span>The URL where you connect your own X account.</span>
                </li>
                <li>
                  <code>x_connection_status</code>
                  <span>Which account this personal key posts as.</span>
                </li>
                <li>
                  <code>x_prepare_post</code>
                  <span>Draft a post with text, an image, a GIF, or an MP4. Does not post.</span>
                </li>
                <li>
                  <code>x_publish_post</code>
                  <span>Publish that exact draft after you confirm it.</span>
                </li>
                <li>
                  <code>x_get_mentions</code>
                  <span>Mentions and replies not yet answered. The text is untrusted.</span>
                </li>
                <li>
                  <code>x_sync_mentions</code>
                  <span>Pull @mentions when the webhook is not registered.</span>
                </li>
              </ul>
              <p className="card-note">
                Images are JPEG, PNG, or WEBP, up to 5MB. GIF up to 15MB. An MP4 is H.264 video and AAC audio, up to
                25MB. A reply is the same draft, on that mention&apos;s thread, and it counts against a per-author cap
                and a daily cap.
              </p>
            </article>

            <article className="card card-trade">
              <div className="card-kicker">
                <span className="card-icon">
                  <TradeIcon />
                </span>
                <h3>Trade</h3>
              </div>
              <ul className="tool-lines">
                <li>
                  <code>trade_board</code>
                  <span>StonkFun listings.</span>
                </li>
                <li>
                  <code>trade_swap</code>
                  <span>Market buy or sell of a pump.fun or StonkFun mint against SOL, through Jupiter.</span>
                </li>
                <li>
                  <code>trade_order</code>
                  <span>A limit, stop, take-profit/stop, or DCA, through Jupiter.</span>
                </li>
              </ul>
            </article>

            <article className="card card-perps">
              <div className="card-kicker">
                <span className="card-icon">
                  <PerpsIcon />
                </span>
                <h3>Perps</h3>
              </div>
              <ul className="tool-lines">
                <li>
                  <code>perp_markets</code>
                  <span>Mark price and 24h change for SOL, ETH, and BTC.</span>
                </li>
                <li>
                  <code>perp_positions</code>
                  <span>Open positions and working limit orders.</span>
                </li>
                <li>
                  <code>perp_open</code>
                  <span>Long or short SOL, ETH, or BTC. Returns a signing link.</span>
                </li>
                <li>
                  <code>perp_close</code>
                  <span>Close one position back to USDC.</span>
                </li>
                <li>
                  <code>perp_exit</code>
                  <span>Set or cancel a take profit, stop, or working limit.</span>
                </li>
              </ul>
            </article>

            <article className="card card-maker">
              <div className="card-kicker">
                <span className="card-icon">
                  <MakerIcon />
                </span>
                <h3>Maker</h3>
              </div>
              <ul className="tool-lines">
                <li>
                  <code>start_maker</code>
                  <span>Open a disclosed two-sided quoter on one pump.fun mint, from one wallet.</span>
                </li>
                <li>
                  <code>maker_status</code>
                  <span>The wallet, its position, the last bid and ask, and time left.</span>
                </li>
                <li>
                  <code>stop_maker</code>
                  <span>End the session and discard its quoting key. The maker wallet signs.</span>
                </li>
              </ul>
            </article>
          </div>
        </section>

        <section id="connect" className="band" aria-labelledby="connect-title">
          <header className="section-head">
            <p className="eyebrow">Connect</p>
            <h2 id="connect-title">Add the MCP, then connect your X account</h2>
            <p>Launches and trades need no API key. Posting uses the personal key from the account you connect.</p>
          </header>
          <div className="connect-grid">
            <article className="panel">
              <p className="step-kicker">
                <span>01</span> Add the MCP
              </p>
              <CopyField value={MCP_URL} label="MCP URL" />
              <p className="panel-note">
                Claude: Settings → Connectors → Add custom connector. ChatGPT: Settings → Connectors → Advanced →
                Add. Grok: add it as a custom MCP server. Launches and trades need no API key.
              </p>
            </article>
            <article className="panel panel-accent">
              <p className="step-kicker">
                <span>02</span> Connect your X account
              </p>
              <p>Each user connects their own account and gets a personal key.</p>
              <Link className="btn btn-primary btn-lg" href="/x">
                Connect X
              </Link>
              <p className="panel-note">
                The key is shown once on that page. The client sends it as <code>Authorization: Bearer</code> on the
                MCP request. A missing key cannot post.
              </p>
            </article>
          </div>
        </section>

        <section id="trust" className="band" aria-labelledby="trust-title">
          <header className="section-head">
            <p className="eyebrow">Trust</p>
            <h2 id="trust-title">Your keys stay yours</h2>
          </header>
          <div className="trust-grid">
            <article>
              <h3>Wallet</h3>
              <p>
                labs never asks for a wallet private key. Your wallet signs every transaction, and that signature is
                what authorises the launch, the trade, and the perp.
              </p>
            </article>
            <article>
              <h3>Mint and maker</h3>
              <p>
                The new token&apos;s mint key is generated here, sealed until you have signed, and then used only to
                co-sign the create. It holds no funds. A maker session can hold the throwaway quoting key you generate
                in your browser. That key is capped and expires.
              </p>
            </article>
            <article>
              <h3>X tokens</h3>
              <p>
                An X connection seals that account&apos;s access and refresh tokens on the server. Each person who
                connects at <Link href="/x">/x</Link> gets their own personal key, shown once.
              </p>
            </article>
            <article>
              <h3>Confirm, then post</h3>
              <p>
                A draft is posted only after that person confirms it, and only as their account. Replies are capped.
                Nothing posts or replies on its own.
              </p>
            </article>
          </div>
        </section>
      </main>
      <footer className="mkt-foot">
        <p>
          source <a href={GITHUB_REPO_URL}>github.com/koynlabs/labs-mcp</a>
          <span className="sep">·</span>
          <a href="/.well-known/security.txt">security</a>
        </p>
      </footer>
    </SiteChrome>
  );
}
