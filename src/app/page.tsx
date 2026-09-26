import Wordmark from "@/components/Wordmark";
import { FEE_SOL } from "@/lib/config";
import {
  GITHUB_COMMIT_URL,
  GITHUB_REPO_URL,
  GIT_SHA_SHORT,
} from "@/lib/revision";
import { HOLD_WAIVES_FEE } from "@/lib/site";

export default function Home() {
  return (
    <main className="wrap">
      <Wordmark />
      <p className="muted">
        Launch a token on pump.fun or StonkFun by asking your assistant.
      </p>

      <p>
        labs is an MCP server. Connect it to Claude, ChatGPT or Grok and they can
        build a launch for you: metadata, the create transaction, and opening
        buys from up to three wallets you control, all in one atomic Jito bundle.
        It hands back a link where your wallet signs. {FEE_SOL} SOL per launch,
        paid inside the same bundle. Nothing else, no subscription.
      </p>

      {HOLD_WAIVES_FEE ? (
        <>
          <h2>Or hold $LEVERCOIN and pay nothing</h2>
          <p>
            Hold {FEE_SOL} SOL worth of $LEVERCOIN in the wallet that would have
            paid, and the fee is dropped from the bundle. You are not spending
            the $LEVERCOIN and labs cannot touch it: it reads the balance, and
            the tokens stay where they are. Keep holding until the launch lands,
            because the balance is read again on submit.
          </p>
        </>
      ) : null}

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
          <code>stonks_pairs</code> — what a StonkFun launch can trade against
        </li>
        <li>
          <code>start_maker</code>, <code>maker_status</code>,{" "}
          <code>stop_maker</code> — a disclosed two-sided quoter on one mint from
          one wallet
        </li>
      </ul>

      <h2>Your keys stay yours</h2>
      <p>
        labs never asks for a private key and has no way to move your funds. Every
        transaction is built unsigned, shown to you, and signed in your own
        wallet. The only key it ever holds is the throwaway quoting key you
        generate in your browser if you start a maker session, and that one is
        capped and expires.
      </p>

      <p className="revision muted">
        {GIT_SHA_SHORT ? (
          <>
            this deploy is{" "}
            <a href={GITHUB_COMMIT_URL}>{GIT_SHA_SHORT}</a> on{" "}
            <a href={GITHUB_REPO_URL}>github.com/koynlabs/labs-mcp</a>
          </>
        ) : (
          <>
            source{" "}
            <a href={GITHUB_REPO_URL}>github.com/koynlabs/labs-mcp</a>
          </>
        )}
      </p>
    </main>
  );
}
