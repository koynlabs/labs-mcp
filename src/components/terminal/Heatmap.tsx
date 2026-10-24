"use client";

import { useEffect, useRef, useState } from "react";
import { DESK_ORIGIN } from "@/config/token";

type HeatmapToken = {
  mint: string;
  name: string;
  symbol: string;
  marketCapUsd: number;
  priceChange24h: number;
  isLever: boolean;
};
type Box = { x: number; y: number; w: number; h: number };

type Laid = HeatmapToken & Box;

function tileColor(change: number) {
  const t = Math.min(1, Math.abs(change) / 60);
  if (change >= 0) {
    const r = Math.round(8 + (34 - 8) * t);
    const g = Math.round(18 + (176 - 18) * t);
    const b = Math.round(14 + (74 - 14) * t);
    return `rgb(${r},${g},${b})`;
  }
  const r = Math.round(32 + (185 - 32) * t);
  const g = Math.round(10 + (28 - 10) * t);
  const b = Math.round(12 + (32 - 12) * t);
  return `rgb(${r},${g},${b})`;
}

function formatUsd(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatChange(value: number) {
  const digits = Math.abs(value) >= 100 ? 0 : 2;
  const rounded = value.toFixed(digits);
  return `${value > 0 ? "+" : ""}${rounded}%`;
}

/** Squarified treemap. Areas are already in pixel². */
function squarify(areas: number[], width: number, height: number): Box[] {
  const out: Box[] = new Array(areas.length);
  const items = areas.map((area, index) => ({ area, index }));

  const place = (
    row: { area: number; index: number }[],
    x: number,
    y: number,
    w: number,
    h: number,
  ) => {
    const sum = row.reduce((acc, item) => acc + item.area, 0);
    if (w >= h) {
      const strip = sum / h;
      let cy = y;
      for (const item of row) {
        const bh = item.area / strip;
        out[item.index] = { x, y: cy, w: strip, h: bh };
        cy += bh;
      }
      return { x: x + strip, y, w: w - strip, h };
    }
    const strip = sum / w;
    let cx = x;
    for (const item of row) {
      const bw = item.area / strip;
      out[item.index] = { x: cx, y, w: bw, h: strip };
      cx += bw;
    }
    return { x, y: y + strip, w, h: h - strip };
  };

  const worst = (row: { area: number }[], short: number) => {
    const sum = row.reduce((acc, item) => acc + item.area, 0);
    let min = Infinity;
    let max = 0;
    for (const item of row) {
      min = Math.min(min, item.area);
      max = Math.max(max, item.area);
    }
    const s2 = short * short;
    const a2 = sum * sum;
    return Math.max((s2 * max) / a2, a2 / (s2 * min));
  };

  const layout = (
    rest: { area: number; index: number }[],
    x: number,
    y: number,
    w: number,
    h: number,
  ) => {
    if (!rest.length || w <= 0 || h <= 0) return;
    if (rest.length === 1) {
      out[rest[0].index] = { x, y, w, h };
      return;
    }
    const short = Math.min(w, h);
    const row = [rest[0]];
    let i = 1;
    while (i < rest.length) {
      const next = [...row, rest[i]];
      if (worst(row, short) >= worst(next, short)) {
        row.push(rest[i]);
        i += 1;
      } else {
        break;
      }
    }
    const nextRect = place(row, x, y, w, h);
    layout(rest.slice(row.length), nextRect.x, nextRect.y, nextRect.w, nextRect.h);
  };

  layout(items, 0, 0, width, height);
  return out;
}

export default function Heatmap() {
  const host = useRef<HTMLDivElement>(null);
  const [tokens, setTokens] = useState<HeatmapToken[] | null>(null);
  const [error, setError] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/heatmap");
        if (!res.ok) throw new Error("heatmap failed");
        const body = (await res.json()) as { tokens: HeatmapToken[] };
        if (!cancelled) setTokens(body.tokens ?? []);
      } catch {
        if (!cancelled) setError(true);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setSize({ w: rect.width, h: rect.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [tokens]);

  const laid: Laid[] = [];
  if (tokens && size.w > 0 && size.h > 0) {
    const total = tokens.reduce((sum, token) => sum + token.marketCapUsd, 0);
    const areas = tokens.map((token) => (token.marketCapUsd / total) * size.w * size.h);
    const boxes = squarify(areas, size.w, size.h);
    tokens.forEach((token, i) => {
      const box = boxes[i];
      if (box) laid.push({ ...token, ...box });
    });
  }

  return (
    <div className="hm">
      <div ref={host} className="hm-board">
        {!tokens && !error ? <p className="hm-note">loading heatmap…</p> : null}
        {error ? <p className="hm-note term-err">heatmap unavailable</p> : null}
        {laid.map((tile) => {
          const w = Math.max(0, tile.w - 2);
          const h = Math.max(0, tile.h - 2);
          const showSymbol = w > 36 && h > 22;
          const showChange = w > 52 && h > 40;
          const showCap = w > 52 && h > 56;
          return (
            <a
              key={tile.mint}
              href={`${DESK_ORIGIN}/meme/${tile.mint}`}
              title={`${tile.name} ${formatChange(tile.priceChange24h)} ${formatUsd(tile.marketCapUsd)}`}
              onClick={(e) => e.stopPropagation()}
              className="hm-tile"
              style={{
                left: tile.x + 1,
                top: tile.y + 1,
                width: w,
                height: h,
                background: tileColor(tile.priceChange24h),
                boxShadow: tile.isLever ? "inset 0 0 0 1px #fff" : undefined,
              }}
            >
              {showSymbol ? (
                <span className="hm-symbol">
                  {tile.symbol}
                </span>
              ) : null}
              {showChange ? (
                <span>
                  {formatChange(tile.priceChange24h)}
                </span>
              ) : null}
              {showCap ? (
                <span className="hm-cap">
                  {formatUsd(tile.marketCapUsd)}
                </span>
              ) : null}
            </a>
          );
        })}
      </div>
      <p className="hm-foot">
        box size is market cap. colour is the 24h move. full strength at ±60%.
      </p>
    </div>
  );
}
