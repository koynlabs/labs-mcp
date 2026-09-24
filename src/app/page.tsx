import { FEE_SOL } from "@/lib/config";

export default function Home() {
  return (
    <main className="wrap">
      <h1>labs</h1>
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

      <h2>What it will not do</h2>
      <p className="muted">
        No volume generation, no wash trading, no spreading one operator&apos;s
        activity across wallets to look like a crowd, no proxy rotation, no
        automated comments or fake profiles. The maker is a single public address
        that quotes a spread and trades only when price crosses it. If you want
        the other thing, this is the wrong tool.
      </p>
    </main>
  );
}
