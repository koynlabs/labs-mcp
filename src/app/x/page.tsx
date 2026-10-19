import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import Wordmark from "@/components/Wordmark";
import { xConfigFromEnv } from "@/lib/x/config";
import { xCallbackUrl, xConnectUrl, xWebhookUrl, X_OWNER_COOKIE, X_SCOPES } from "@/lib/x/constants";
import { cookieCanManage, readAccount } from "@/lib/x/oauth";
import { xStore } from "@/lib/x/store";
import { consumerSecretFromEnv } from "@/lib/x/webhook";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "X",
  description: "Connect one X account so labs can publish a post the owner confirms.",
  robots: { index: false, follow: false },
};

const ERRORS: Record<string, string> = {
  config: "X_CLIENT_ID and X_CLIENT_SECRET are not set on this deployment.",
  state: "That sign-in expired or did not match. Start again.",
  denied: "X authorization was declined.",
  token: "X did not return a usable token. Start again.",
  scope: "X did not grant tweet.write, media.write, and offline.access. Add those scopes and start again.",
  disconnect: "Disconnect is available in the browser that connected this account. Sign in again as the same @username to replace the token.",
  revoke: "Disconnected here. X did not confirm the revoke. Remove labs from the account's connected apps if it still appears.",
};

export default async function XPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const errorCode = typeof params.error === "string" ? params.error : "";
  const accountName = typeof params.account === "string" && /^[A-Za-z0-9_]{1,15}$/.test(params.account)
    ? params.account
    : "";
  const jar = await cookies();
  const cookie = jar.get(X_OWNER_COOKIE)?.value ?? null;
  const configured = xConfigFromEnv() !== null;
  const account = configured ? await readAccount(xStore) : null;
  const canDisconnect = cookieCanManage(account, cookie);
  const webhookReady = consumerSecretFromEnv() !== null;
  const error =
    errorCode === "occupied"
      ? `Already connected as @${accountName || account?.username || "another account"}. Sign in as that account to replace the token, or disconnect first.`
      : ERRORS[errorCode];

  return (
    <main className="wrap x-page">
      <div className="x-cta">
        {account ? (
          <div className="x-account">
            <strong>Connected as @{account.username}</strong>
            {canDisconnect ? (
              <form method="post" action="/api/x/disconnect" className="x-disconnect">
                <button type="submit">Disconnect</button>
              </form>
            ) : (
              <span className="muted">Disconnect is available in the browser that connected this account.</span>
            )}
          </div>
        ) : (
          <a className="x-connect" href={xConnectUrl()}>
            Connect X
          </a>
        )}
      </div>
      <Wordmark />
      <h1>X</h1>
      <p className="muted">
        One account. A post goes out only after it is prepared and then published. Nothing here posts by itself.
      </p>

      {params.connected === "1" ? <p className="ok">Connected.</p> : null}
      {params.disconnected === "1" ? <p className="ok">Disconnected.</p> : null}
      {error ? <p className="warn">{error}</p> : null}

      <ul className="caps">
        <li>
          status
          <span className={`state ${account ? "ok" : ""}`}>{account ? "connected" : "not connected"}</span>
        </li>
        <li>
          account
          <span className="state">{account ? `@${account.username}` : "none"}</span>
        </li>
        <li>
          app
          <span className={`state ${configured ? "ok" : "bad"}`}>{configured ? "configured" : "missing env"}</span>
        </li>
      </ul>

      {account ? (
        <p>
          Posts from the MCP go out as @{account.username}. {account.name !== account.username ? account.name : ""}
        </p>
      ) : (
        <p>Connect the account that should publish launch posts. For this deployment that is @cyberpsychoxx78.</p>
      )}

      <h2>Sign-in URL</h2>
      <pre>{xConnectUrl()}</pre>
      {configured ? null : <p className="muted">Set the X env vars, then use Connect X.</p>}

      <h2>Callback</h2>
      <p className="muted">
        Add this exact URL to the X app&apos;s allowed callbacks. The same app KOYN FX uses can list both.
      </p>
      <pre>{xCallbackUrl()}</pre>

      <h2>Webhook</h2>
      <p className="muted">
        Account Activity delivers mentions and replies here. The CRC response is HMAC-SHA256 of crc_token with the
        app API Key Secret in X_CONSUMER_SECRET.
        {webhookReady ? " That secret is set." : " That secret is not set, so CRC checks fail until it is."}
      </p>
      <pre>{xWebhookUrl()}</pre>

      <h2>Scopes</h2>
      <pre>{X_SCOPES.join(" ")}</pre>
      <p className="muted">
        Media can be an https URL or a file uploaded to <code>/api/x/media</code>. A video is an MP4, H.264 and AAC,
        up to 25MB. <Link href="/">Back to labs</Link>.
      </p>
    </main>
  );
}
