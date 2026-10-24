"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { tapes, tapeIndex, type Tape } from "@/config/tapes";

export type GlyphPlayerHandle = {
  togglePause: () => void;
  next: () => void;
  prev: () => void;
  toggleMute: () => void;
};

type Props = {
  tape: Tape;
  /** only the most recent tape row is live; going false pauses playback */
  live: boolean;
};

function fmtTime(s: number) {
  if (!Number.isFinite(s)) return "--:--";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

const GlyphPlayer = forwardRef<GlyphPlayerHandle, Props>(function GlyphPlayer(
  { tape: initialTape, live },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const [tape, setTape] = useState(initialTape);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [autoplayMuted, setAutoplayMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ pct: 0, cur: 0, dur: 0 });

  const togglePause = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play().catch(() => undefined);
      setPaused(false);
    } else {
      v.pause();
      setPaused(true);
    }
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    setAutoplayMuted(false);
  }, []);

  const step = useCallback((dir: 1 | -1) => {
    setTape((cur) => {
      const i = tapeIndex(cur);
      const next = tapes[(i + dir + tapes.length) % tapes.length];
      return next ?? cur;
    });
    setPaused(false);
    setError(null);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      togglePause,
      toggleMute,
      next: () => step(1),
      prev: () => step(-1),
    }),
    [togglePause, toggleMute, step],
  );

  // start playback on mount / tape change while the Enter keystroke still
  // counts as a user gesture; fall back to muted autoplay if blocked.
  useLayoutEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
    const attempt = v.play();
    if (attempt) {
      attempt.catch(() => {
        v.muted = true;
        setMuted(true);
        setAutoplayMuted(true);
        void v.play().catch(() => setError("autoplay blocked — press space"));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tape.src]);

  // pause when a newer tape row takes over
  useEffect(() => {
    if (!live) {
      videoRef.current?.pause();
      setPaused(true);
    }
  }, [live]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const sync = () => {
      const dur = v.duration || 0;
      const cur = v.currentTime || 0;
      const pct = dur ? Math.min(1, cur / dur) : 0;
      setProgress((p) =>
        Math.abs(p.pct - pct) > 0.01 || Math.floor(p.cur) !== Math.floor(cur)
          ? { pct, cur, dur }
          : p,
      );
    };

    v.addEventListener("timeupdate", sync);
    v.addEventListener("loadedmetadata", sync);
    v.addEventListener("durationchange", sync);
    return () => {
      v.removeEventListener("timeupdate", sync);
      v.removeEventListener("loadedmetadata", sync);
      v.removeEventListener("durationchange", sync);
    };
  }, [tape.src]);

  const idx = tapeIndex(tape);
  const barLen = 24;
  const filled = Math.round(progress.pct * barLen);
  const bar = "#".repeat(filled) + "-".repeat(Math.max(0, barLen - filled));

  return (
    <div className="glyph">
      <div className="glyph-bar">
        <span>/dev/brainrot/{tape.id}</span>
        <span>{paused ? "PAUSED" : muted ? "MUTED" : "PLAYING"}</span>
      </div>

      <div
        className="glyph-stage"
        onClick={(e) => {
          e.stopPropagation();
          togglePause();
        }}
      >
        <video
          ref={videoRef}
          src={tape.src}
          playsInline
          loop
          preload="auto"
          className="glyph-video"
          onError={() => setError("tape failed to load")}
        />
      </div>

      <div className="glyph-meta">
        {error ? (
          <p className="term-err">{error}</p>
        ) : (
          <>
            <p>
              tape {String(idx + 1).padStart(2, "0")} — {tape.title}
            </p>
            <p>
              [{bar}] {fmtTime(progress.cur)}/{fmtTime(progress.dur)}
            </p>
            <p className="term-dim">
              space pause · n next · p prev · m mute
              {autoplayMuted ? "  (muted — press m)" : ""}
            </p>
          </>
        )}
      </div>
    </div>
  );
});

export default GlyphPlayer;
