import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import CopyField from "@/components/site/CopyField";
import SiteChrome from "@/components/site/SiteChrome";
import { xConfigFromEnv } from "@/lib/x/config";
import { xCallbackUrl, xConnectUrl, xWebhookUrl, X_OWNER_COOKIE, X_SCOPES } from "@/lib/x/constants";
import { consumePersonalKey, readAccountByCookie } from "@/lib/x/oauth";
import { xStore } from "@/lib/x/store";
import { consumerSecretFromEnv } from "@/lib/x/webhook";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connect X",
  description: "Connect your own X account and copy the personal key for the labs MCP. The key is shown once.",
  robots: { index: false, follow: false },
};

const ERRORS: Record<string, string> = {
  config: "X_CLIENT_ID and X_CLIENT_SECRET are not set on this deployment.",
  state: "That sign-in expired or did not match. Start again.",
  denied: "X authorization was declined.",
  token: "X did not return a usable token. Start again.",
  scope: "X did not grant tweet.write, media.write, and offline.access. Add those scopes and start again.",
  disconnect: "Disconnect only works in the browser that connected this account.",
  revoke: "Disconnected here. X did not confirm the revoke. Remove labs from the account's connected apps if it still appears.",
};

export default async function XPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const errorCode = typeof params.error === "string" ? params.error : "";
  const jar = await cookies();
  const cookie = jar.get(X_OWNER_COOKIE)?.value ?? null;
  const config = xConfigFromEnv();
  const configured = config !== null;
  const account = config ? await readAccountByCookie(xStore, cookie) : null;
  const personalKey = config && account ? await consumePersonalKey(xStore, config.encryptionSecret, cookie) : null;
  const webhookReady = consumerSecretFromEnv() !== null;
  const error = ERRORS[errorCode];

  return (
    <SiteChrome connectHref={null}>
      <main id="content" className="x-main">
        <section className="hero x-hero" aria-labelledby="x-title">
          <div className="hero-copy">
            <p className="eyebrow">Your account</p>
            <h1 id="x-title">Connect the X account this assistant posts as.</h1>
            <p className="lede">
              Each person connects their own account. The MCP posts only as the account for the personal key on that
              request. A post goes out only after it is prepared and then published.
            </p>
            {account ? (
              <div className="x-account">
                <strong>Connected as @{account.username}</strong>
                <form method="post" action="/api/x/disconnect">
                  <button className="btn btn-ghost" type="submit">
                    Disconnect
                  </button>
                </form>
                <a className="btn btn-ghost" href={xConnectUrl()}>
                  Connect again
                </a>
              </div>
            ) : (
              <a className="btn btn-primary btn-lg" href={xConnectUrl()}>
                Connect X
              </a>
            )}
          </div>
        </section>

        {personalKey ? (
          <div className="banner banner-ok" role="status">
            <p>Connected. Copy this personal key now. It is shown once.</p>
            <CopyField value={personalKey} label="Personal key" />
            <p>
              Send it on the MCP request as <code>Authorization: Bearer</code> followed by the key. Do not put it in a
              tool argument. Connecting again as @{account?.username} rotates the key and the previous one stops
              working.
            </p>
          </div>
        ) : params.connected === "1" ? (
          <p className="banner banner-ok" role="status">
            Connected. The personal key was already shown. Connect again to issue a new one.
          </p>
        ) : null}
        {account && !account.keyHash && !personalKey ? (
          <p className="banner warn" role="alert">
            Connected as @{account.username}, but this connection has no personal key yet. Connect again as that
            account. That visit issues a key and replaces the token. Until then, MCP calls for this account are
            refused.
          </p>
        ) : null}
        {params.disconnected === "1" ? (
          <p className="banner banner-ok" role="status">
            Disconnected.
          </p>
        ) : null}
        {error ? (
          <p className="banner warn" role="alert">
            {error}
          </p>
        ) : null}

        <dl className="stats">
          <div>
            <dt>Status</dt>
            <dd className={account ? "ok" : undefined}>{account ? "Connected" : "Not connected"}</dd>
          </div>
          <div>
            <dt>Account</dt>
            <dd>{account ? `@${account.username}` : "None"}</dd>
          </div>
          <div>
            <dt>App</dt>
            <dd className={configured ? "ok" : "bad"}>{configured ? "Configured" : "Missing env"}</dd>
          </div>
        </dl>

        {account ? (
          <p className="lede x-follow">
            Posts from a client using this browser&apos;s key go out as @{account.username}.
            {account.name !== account.username ? ` ${account.name}` : ""}
          </p>
        ) : (
          <p className="lede x-follow">
            Connect the X account this client should post as. The next page shows a personal key once.
          </p>
        )}

        <section className="band" aria-labelledby="endpoints-title">
          <header className="section-head">
            <p className="eyebrow">Setup</p>
            <h2 id="endpoints-title">Endpoints</h2>
          </header>
          <div className="endpoint-grid">
            <article className="panel">
              <h3>Sign-in URL</h3>
              <CopyField value={xConnectUrl()} label="Sign-in URL" />
              {configured ? null : <p className="panel-note">Set the X env vars, then use Connect X.</p>}
            </article>
            <article className="panel">
              <h3>Callback</h3>
              <p className="panel-note">
                Add this exact URL to the X app&apos;s allowed callbacks. The same app KOYN FX uses can list both.
              </p>
              <CopyField value={xCallbackUrl()} label="OAuth callback URL" />
            </article>
            <article className="panel">
              <h3>Webhook</h3>
              <p className="panel-note">
                Account Activity delivers mentions and replies here. The CRC response is HMAC-SHA256 of crc_token with
                the app API Key Secret in X_CONSUMER_SECRET.
                {webhookReady ? " That secret is set." : " That secret is not set, so CRC checks fail until it is."}
              </p>
              <CopyField value={xWebhookUrl()} label="Webhook URL" />
            </article>
          </div>
        </section>

        <section className="band" aria-labelledby="scopes-title">
          <header className="section-head">
            <p className="eyebrow">Access</p>
            <h2 id="scopes-title">Scopes</h2>
          </header>
          <ul className="scope-list">
            {X_SCOPES.map((scope) => (
              <li key={scope}>
                <code>{scope}</code>
              </li>
            ))}
          </ul>
          <p className="panel-note">
            Media can be an https URL or a file uploaded to <code>/api/x/media</code>. A video is an MP4, H.264 and
            AAC, up to 25MB. <Link href="/">Back to labs</Link>.
          </p>
        </section>
      </main>
    </SiteChrome>
  );
}
