import type { CSSProperties } from "react";
import Link from "next/link";
import Wordmark from "@/components/Wordmark";
import { Button } from "@/components/site/Button";
import CopyField from "@/components/site/CopyField";
import LaunchTranscript from "@/components/site/LaunchTranscript";
import LabsMotion from "@/components/site/LabsMotion";
import { Panel } from "@/components/site/Panel";
import CryptoTape from "@/components/site/CryptoTape";
import SiteChrome from "@/components/site/SiteChrome";
import GrokRive from "@/components/site/GrokRive";
import { LaunchIcon, MakerIcon, PerpsIcon, TradeIcon, XIcon } from "@/components/site/icons";
import { SITE_URL } from "@/lib/config";
import { KOYN_DESK_URL, KOYN_PERPS_URL } from "@/lib/koyn";

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
    <SiteChrome tape={<CryptoTape />}>
      {/* Build-time values only: this page is prerendered, and reading request
          state or a store here would silently make it dynamic. */}
      <LabsMotion>
        <main id="content" className="labs-land">
          <section className="labs-stage labs-hero" aria-labelledby="hero-title">
            <div className="labs-copy">
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
                <Button href="#connect">Add the MCP</Button>
                <Button href="/x" variant="ghost">
                  Connect X
                </Button>
                <Button href={KOYN_DESK_URL} variant="ghost">
                  Trade on KOYN
                </Button>
              </div>
            </div>
            <div className="labs-aside">
              <GrokRive className="labs-rive" />
              <LaunchTranscript />
            </div>
          </section>

          <section id="flow" className="labs-pin" aria-labelledby="flow-title">
            <div className="labs-head">
              <div className="labs-copy">
                <p className="eyebrow">Pipeline</p>
                <h2 id="flow-title">How a launch goes</h2>
                <p className="lede">One assistant, from the create to the post. X is a step in that pipeline.</p>
              </div>
              <p className="labs-step" aria-hidden="true">
                01 Build
              </p>
            </div>
            <div className="labs-progress" aria-hidden="true">
              <span />
            </div>
            <div className="labs-window">
              <div className="labs-track" style={{ "--panels": STEPS.length } as CSSProperties}>
                {STEPS.map((step) => (
                  <article className="labs-panel" data-label={`${step.n} ${step.title}`} key={step.n}>
                    <div>
                      <p className="labs-index">{step.n}</p>
                      <p className="eyebrow">Pipeline</p>
                      <h3>{step.title}</h3>
                    </div>
                    <p>{step.text}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section id="tools" className="labs-pin" aria-labelledby="tools-title">
            <div className="labs-head">
              <div className="labs-copy">
                <p className="eyebrow">Capabilities</p>
                <h2 id="tools-title">Tools</h2>
                <p className="lede">The same MCP. Grouped by what the assistant can actually do.</p>
              </div>
              <p className="labs-step" aria-hidden="true">
                01 Launch
              </p>
            </div>
            <div className="labs-progress" aria-hidden="true">
              <span />
            </div>
            <div className="labs-window">
              <div className="labs-track" style={{ "--panels": 5 } as CSSProperties}>
                <article className="labs-panel" data-label="01 Launch">
                  <div>
                    <p className="labs-index">01</p>
                    <div className="card-kicker">
                      <span className="card-icon">
                        <LaunchIcon />
                      </span>
                      <h3>Launch</h3>
                    </div>
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

                <article className="labs-panel" data-label="02 X">
                  <div>
                    <p className="labs-index">02</p>
                    <div className="card-kicker">
                      <span className="card-icon">
                        <XIcon />
                      </span>
                      <h3>X</h3>
                    </div>
                  </div>
                  <div>
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
                      <li>
                        <code>x_like_post</code>
                        <span>Like one post by id or URL, as this account.</span>
                      </li>
                      <li>
                        <code>x_unlike_post</code>
                        <span>Remove that like.</span>
                      </li>
                    </ul>
                    <p className="card-note">
                      Images are JPEG, PNG, or WEBP, up to 5MB. GIF up to 15MB. An MP4 is H.264 video and AAC audio, up
                      to 25MB. A reply is the same draft, on that mention&apos;s thread, and it counts against a
                      per-author cap and a daily cap. Likes use the same kind of daily cap. An account connected before
                      likes were added has to reconnect once.
                    </p>
                  </div>
                </article>

                <article className="labs-panel" data-label="03 Trade">
                  <div>
                    <p className="labs-index">03</p>
                    <div className="card-kicker">
                      <span className="card-icon">
                        <TradeIcon />
                      </span>
                      <h3>Trade</h3>
                    </div>
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
                  <p className="card-note">
                    The board and the chart live on the <a href={KOYN_DESK_URL}>KOYN desk</a>. These tools read the
                    same listings.
                  </p>
                </article>

                <article className="labs-panel" data-label="04 Perps">
                  <div>
                    <p className="labs-index">04</p>
                    <div className="card-kicker">
                      <span className="card-icon">
                        <PerpsIcon />
                      </span>
                      <h3>Perps</h3>
                    </div>
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
                  <p className="card-note">
                    Positions are also on <a href={KOYN_PERPS_URL}>KOYN perps</a>.
                  </p>
                </article>

                <article className="labs-panel" data-label="05 Maker">
                  <div>
                    <p className="labs-index">05</p>
                    <div className="card-kicker">
                      <span className="card-icon">
                        <MakerIcon />
                      </span>
                      <h3>Maker</h3>
                    </div>
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
            </div>
          </section>

          <section id="connect" className="labs-stage labs-connect" aria-labelledby="connect-title">
            <div className="labs-copy">
              <p className="eyebrow">Connect</p>
              <h2 id="connect-title">Add the MCP, then connect your X account</h2>
              <p className="lede">
                Launches and trades need no API key. Posting uses the personal key from the account you connect.
              </p>
            </div>
            <div className="labs-stack">
              <Panel>
                <p className="step-kicker">
                  <span>01</span> Add the MCP
                </p>
                <CopyField value={MCP_URL} label="MCP URL" />
                <p className="panel-note">
                  Claude: Settings → Connectors → Add custom connector. ChatGPT: Settings → Connectors → Advanced →
                  Add. Grok: add it as a custom MCP server. Launches and trades need no API key.
                </p>
              </Panel>
              <Panel accent>
                <p className="step-kicker">
                  <span>02</span> Connect your X account
                </p>
                <p>Each user connects their own account and gets a personal key.</p>
                <Button href="/x" size="lg">
                  Connect X
                </Button>
                <p className="panel-note">
                  The key is shown once on that page. The client sends it as <code>Authorization: Bearer</code> on the
                  MCP request. A missing key cannot post.
                </p>
              </Panel>
            </div>
          </section>

          <section id="trust" className="labs-stage labs-trust" aria-labelledby="trust-title">
            <div className="labs-copy">
              <p className="eyebrow">Trust</p>
              <h2 id="trust-title">Your keys stay yours</h2>
            </div>
            <ol className="labs-bands">
              <li className="labs-band">
                <span className="labs-band-label">Wallet</span>
                <span>
                  labs never asks for a wallet private key. Your wallet signs every transaction, and that signature is
                  what authorises the launch, the trade, and the perp.
                </span>
              </li>
              <li className="labs-band">
                <span className="labs-band-label">Mint</span>
                <span>
                  The new token&apos;s mint key is generated here, sealed until you have signed, and then used only to
                  co-sign the create. It holds no funds. A maker session can hold the throwaway quoting key you generate
                  in your browser. That key is capped and expires.
                </span>
              </li>
              <li className="labs-band">
                <span className="labs-band-label">X</span>
                <span>
                  An X connection seals that account&apos;s access and refresh tokens on the server. Each person who
                  connects at <Link href="/x">/x</Link> gets their own personal key, shown once.
                </span>
              </li>
              <li className="labs-band">
                <span className="labs-band-label">Post</span>
                <span>
                  A draft is posted only after that person confirms it, and only as their account. Replies are capped.
                  Nothing posts or replies on its own.
                </span>
              </li>
            </ol>
          </section>
        </main>
      </LabsMotion>
    </SiteChrome>
  );
}
