import { DESK_ORIGIN } from "@/config/token";

export type Tape = {
  id: string;
  title: string;
  src: string;
};

const FILES = [
  { id: "rot-1", title: "koyn brainrot vol. 1", file: "/tapes/koyn-1.mp4" },
  { id: "rot-2", title: "koyn brainrot vol. 2", file: "/tapes/koyn-2.mp4" },
  { id: "rot-3", title: "koyn brainrot vol. 3", file: "/tapes/koyn-3.mp4" },
];

/** Playback stays on the desk. The launcher only points at those files. */
export const tapes: Tape[] = FILES.map((tape) => ({
  id: tape.id,
  title: tape.title,
  src: `${DESK_ORIGIN}${tape.file}`,
}));

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
