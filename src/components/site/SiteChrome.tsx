import Link from "next/link";
import { APP_VERSION, GITHUB_COMMIT_URL, GIT_SHA_SHORT } from "@/lib/revision";

export default function SiteChrome({
  children,
  connectHref = "/x",
}: {
  children: React.ReactNode;
  connectHref?: string | null;
}) {
  return (
    <div className="mkt">
      <a className="skip" href="#content">
        Skip to content
      </a>
      <div className="mkt-atmo" aria-hidden="true">
        <div className="mkt-glow" />
        <div className="mkt-grid" />
      </div>
      <header className="mkt-bar">
        <Link className="mkt-logo" href="/" aria-label="labs, home">
          &lt; labs &gt;
        </Link>
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
        <nav className="mkt-nav" aria-label="Page">
          <a href="/#flow">Flow</a>
          <a href="/#tools">Tools</a>
          {connectHref ? (
            <Link className="btn btn-primary btn-sm" href={connectHref}>
              Connect X
            </Link>
          ) : null}
        </nav>
      </header>
      {children}
    </div>
  );
}
