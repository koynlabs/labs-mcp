export type Tape = {
  /** short slug used by `play <id>` */
  id: string;
  /** one-liner shown in the status line and `tapes` listing */
  title: string;
  /** same-origin video path under public/tapes */
  src: string;
};

/**
 * /dev/brainrot — the MP4s live in public/tapes and are served by this site.
 */
export const tapes: Tape[] = [
  { id: "rot-1", title: "koyn brainrot vol. 1", src: "/tapes/levercoin-1.mp4" },
  { id: "rot-2", title: "koyn brainrot vol. 2", src: "/tapes/levercoin-2.mp4" },
  { id: "rot-3", title: "koyn brainrot vol. 3", src: "/tapes/levercoin-3.mp4" },
  { id: "rot-4", title: "koyn brainrot vol. 4", src: "/tapes/levercoin-4.mp4" },
];

export function findTape(query: string | undefined): Tape | null {
  if (!tapes.length) return null;
  if (!query) return tapes[tapes.length - 1];

  const q = query.trim().toLowerCase();
  const byId = tapes.find((t) => t.id.toLowerCase() === q);
  if (byId) return byId;

  const n = Number.parseInt(q, 10);
  if (Number.isFinite(n) && n >= 1 && n <= tapes.length) return tapes[n - 1];
  return null;
}

export function tapeIndex(tape: Tape) {
  return tapes.findIndex((t) => t.id === tape.id);
}
