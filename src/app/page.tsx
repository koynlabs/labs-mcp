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

      <p className="muted">
        Launch a token on pump.fun or StonkFun by asking your assistant.
      </p>

      <p>
        labs is an MCP server. Connect it to Claude, ChatGPT or Grok and they can
        build a launch for you: metadata, the create transaction, and opening
        buys from up to three wallets you control, all in one atomic Jito bundle.
        It hands back a link where your wallet signs. There is no launch fee
        and no subscription.
      </p>

      <h2>Connect</h2>
      <pre>https://labs.levercoin.lol/mcp</pre>
      <p className="muted">
        Claude: Settings → Connectors → Add custom connector. ChatGPT: Settings →
        Connectors → Advanced → Add. Grok: add it as a custom MCP server.
      </p>

      <h2>Tools</h2>
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
          <code>wallet_balance</code> — size a launch before signing it
        </li>
        <li>
          <code>pump_pairs</code> — what a pump.fun launch can trade against, from the live registry
        </li>
        <li>
          <code>stonks_pairs</code> — what a StonkFun launch can trade against
        </li>
        <li>
          <code>start_maker</code>, <code>maker_status</code>,{" "}
          <code>stop_maker</code> — a disclosed two-sided quoter on one mint from
          one wallet
        </li>
        <li>
          <code>trade_board</code> — StonkFun listings
        </li>
        <li>
          <code>trade_swap</code>, <code>trade_order</code> — market buy or sell, or
          a limit, stop, take-profit/stop, or DCA, of a pump.fun or StonkFun mint
          against SOL through Jupiter
        </li>
        <li>
          <code>perp_markets</code>, <code>perp_positions</code>, <code>perp_open</code>,{" "}
          <code>perp_close</code>, <code>perp_exit</code> — SOL, ETH, and BTC perps
        </li>
        <li>
          <code>x_connect_link</code>, <code>x_connection_status</code>, <code>x_get_mentions</code>,{" "}
          <code>x_sync_mentions</code>, <code>x_prepare_post</code>, <code>x_publish_post</code> — connect one X
          account, then publish a confirmed post or reply as that account
        </li>
      </ul>

      <h2>Your keys stay yours</h2>
      <p>
        labs never asks for a wallet private key. Your wallet signs every
        transaction, and that signature is what authorises the launch. The new
        token&apos;s mint key is generated here, sealed until you have signed, and
        then used only to co-sign the create. It holds no funds. A maker
        session can also hold the throwaway quoting key you generate in your
        browser, and that key is capped and expires. An X connection stores that
        account&apos;s tokens sealed on the server. A post is published only after
        a draft is prepared and then confirmed, and only for a client that sends
        the deployment&apos;s X API key.
      </p>

      <p className="revision muted">
        source <a href={GITHUB_REPO_URL}>github.com/koynlabs/labs-mcp</a>
        <span className="sep">·</span>
        <a href="/.well-known/security.txt">security</a>
      </p>
    </main>
  );
}
