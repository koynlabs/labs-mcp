"use client";

import { useEffect, useState } from "react";
import type { CtPost } from "@/lib/x/trends";

/**
 * The CDN holds the payload for an hour. This only checks for that copy.
 * A hidden tab does not poll. Neither one calls X on its own.
 */
const POLL_MS = 10 * 60 * 1000;

export default function CryptoTape() {
  const [posts, setPosts] = useState<CtPost[]>([]);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduce(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    let cancel = false;
    async function load() {
      if (cancel || document.hidden) return;
      try {
        const res = await fetch("/api/x/trends");
        if (!res.ok) return;
        const body = (await res.json()) as { posts?: CtPost[] };
        if (!cancel && Array.isArray(body.posts)) setPosts(body.posts);
      } catch {
        /* The strip stays on the last good set, or empty. */
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    function onVisibility() {
      if (!document.hidden) void load();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancel = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  if (posts.length === 0) return null;
  const row = reduce ? posts : [...posts, ...posts];

  return (
    <section className="ct-tape" aria-label="Crypto Twitter">
      <p className="ct-label">CT</p>
      <div className="ct-viewport">
        <div className={reduce ? "ct-track is-still" : "ct-track"}>
          {row.map((post, index) => (
            <a
              key={`${post.id}-${index}`}
              className="ct-card"
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {post.avatar ? (
                <img className="ct-avatar" src={post.avatar} alt="" />
              ) : (
                <span className="ct-avatar ct-avatar-empty" aria-hidden="true" />
              )}
              <span className="ct-copy">
                <span className="ct-handle">@{post.username}</span>
                <span className="ct-text">{post.text}</span>
              </span>
              {post.image ? <img className="ct-photo" src={post.image} alt="" /> : null}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
