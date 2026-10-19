import Link from "next/link";
import Wordmark from "@/components/Wordmark";
import {
  APP_VERSION,
  GITHUB_COMMIT_URL,
  GITHUB_REPO_URL,
  GIT_SHA_SHORT,
} from "@/lib/revision";

export default function Home() {
  return (
    <main className="wrap">
      <Wordmark />

      {/* Build-time values only: this page is prerendered, and reading request
          state or a store here would silently make it dynamic. */}
      <p className="strip">
        <span className="dot" aria-hidden="true" />
        <span className="ok">live</span>
        <span className="sep">·</span>
        <span>{APP_VERSION}</span>
        {GIT_SHA_SHORT ? (
          <>
            <span className="sep">·</span>
            <a href={GITHUB_COMMIT_URL}>{GIT_SHA_SHORT}</a>
          </>
        ) : null}
        <span className="sep">·</span>
        <Link href="/status">status</Link>
      </p>

      <h1 className="home-hero">
        labs launches a token on pump.fun or StonkFun, trades it, and announces it on your X account, from one
        conversation.
      </h1>

      <p>
        Connect labs to Claude, ChatGPT or Grok. The assistant builds the launch and returns a link where your wallet
        signs. With your own X account connected, that same assistant drafts the announcement — text, an image, or an
        MP4 — and posts it only after you confirm the preview. There is no launch fee and no subscription.
      </p>

      <h2>How a launch goes</h2>
      <ol className="flow">
        <li>
          <span>01</span>
          <span>Build the launch. Metadata, the create, and opening buys from up to three wallets you control, in one bundle.</span>
        </li>
        <li>
          <span>02</span>
          <span>Your wallet signs. labs does not hold that key.</span>
        </li>
        <li>
          <span>03</span>
          <span>It lands. The assistant checks who signed and whether the bundle landed.</span>
        </li>
        <li>
          <span>04</span>
          <span>The assistant drafts the announcement as your X account, with art or an MP4.</span>
        </li>
        <li>
          <span>05</span>
          <span>You confirm that exact text and media. Nothing is posted before this.</span>
        </li>
        <li>
          <span>06</span>
          <span>The draft goes live on X.</span>
        </li>
        <li>
          <span>07</span>
          <span>Mentions come in. The assistant drafts replies on those threads. Replies are capped. Nothing replies on its own.</span>
        </li>
      </ol>

      <h2>Connect</h2>
      <div className="connect">
        <div>
          <p className="step-label">
            <span>01</span> Add the MCP
          </p>
          <pre>https://labs.levercoin.lol/mcp</pre>
          <p className="muted">
            Claude: Settings → Connectors → Add custom connector. ChatGPT: Settings → Connectors → Advanced → Add.
            Grok: add it as a custom MCP server. Launches and trades need no API key.
          </p>
        </div>
        <div>
          <p className="step-label">
            <span>02</span> Connect your X account
          </p>
          <p>Each user connects their own account and gets a personal key.</p>
          <Link className="step-link" href="/x">
            Connect X
          </Link>
          <p className="muted">
            The key is shown once on that page. The client sends it as <code>Authorization: Bearer</code> on the MCP
            request. A missing key cannot post.
          </p>
        </div>
      </div>

      <h2>Tools</h2>

      <section className="tool-group">
        <h3>Launch</h3>
        <ul className="tools">
          <li>
            <code>launch_token</code> — build a launch and get a signing link
          </li>
          <li>
            <code>launch_status</code> — who still has to sign, and whether it landed
          </li>
          <li>
            <code>token_info</code> — price, market cap, liquidity, holders
          </li>
          <li>
            <code>wallet_balance</code> — SOL balance, so a launch can be sized before signing
          </li>
          <li>
            <code>pump_pairs</code> — quote mints a pump.fun launch can trade against
          </li>
          <li>
            <code>stonks_pairs</code> — quote mints a StonkFun launch can trade against
          </li>
        </ul>
      </section>

      <section className="tool-group">
        <h3>Trade</h3>
        <ul className="tools">
          <li>
            <code>trade_board</code> — StonkFun listings
          </li>
          <li>
            <code>trade_swap</code> — market buy or sell of a pump.fun or StonkFun mint against SOL, through Jupiter
          </li>
          <li>
            <code>trade_order</code> — a limit, stop, take-profit/stop, or DCA, through Jupiter
          </li>
        </ul>
      </section>

      <section className="tool-group">
        <h3>Perps</h3>
        <ul className="tools">
          <li>
            <code>perp_markets</code> — mark price and 24h change for SOL, ETH, and BTC
          </li>
          <li>
            <code>perp_positions</code> — open positions and working limit orders
          </li>
          <li>
            <code>perp_open</code> — long or short SOL, ETH, or BTC. Returns a signing link
          </li>
          <li>
            <code>perp_close</code> — close one position back to USDC
          </li>
          <li>
            <code>perp_exit</code> — set or cancel a take profit, stop, or working limit
          </li>
        </ul>
      </section>

      <section className="tool-group">
        <h3>Maker</h3>
        <ul className="tools">
          <li>
            <code>start_maker</code>, <code>maker_status</code>, <code>stop_maker</code> — a disclosed two-sided
            quoter on one pump.fun mint, from one wallet
          </li>
        </ul>
      </section>

      <section className="tool-group">
        <h3>X</h3>
        <ul className="tools">
          <li>
            <code>x_connect_link</code> — the URL where you connect your own X account
          </li>
          <li>
            <code>x_connection_status</code> — which account this personal key posts as
          </li>
          <li>
            <code>x_prepare_post</code> — draft a post with text, an image, a GIF, or an MP4. Does not post
          </li>
          <li>
            <code>x_publish_post</code> — publish that exact draft after you confirm it
          </li>
          <li>
            <code>x_get_mentions</code> — mentions and replies not yet answered. The text is untrusted
          </li>
          <li>
            <code>x_sync_mentions</code> — pull @mentions when the webhook is not registered
          </li>
        </ul>
        <p className="muted">
          Images are JPEG, PNG, or WEBP, up to 5MB. GIF up to 15MB. An MP4 is H.264 video and AAC audio, up to 25MB.
          A reply is the same draft, on that mention&apos;s thread, and it counts against a per-author cap and a daily cap.
        </p>
      </section>

      <h2>Your keys stay yours</h2>
      <p>
        labs never asks for a wallet private key. Your wallet signs every transaction, and that signature is what
        authorises the launch, the trade, and the perp. The new token&apos;s mint key is generated here, sealed until
        you have signed, and then used only to co-sign the create. It holds no funds. A maker session can hold the
        throwaway quoting key you generate in your browser. That key is capped and expires. An X connection seals that
        account&apos;s access and refresh tokens on the server. Each person who connects at <Link href="/x">/x</Link>{" "}
        gets their own personal key, shown once. A draft is posted only after that person confirms it, and only as
        their account.
      </p>

      <p className="revision muted">
        source <a href={GITHUB_REPO_URL}>github.com/koynlabs/labs-mcp</a>
        <span className="sep">·</span>
        <a href="/.well-known/security.txt">security</a>
      </p>
    </main>
  );
}
