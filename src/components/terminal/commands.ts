import { deskHref, displayOrPending, telegramUrl, token } from "@/config/token";
import { SITE_URL } from "@/lib/config";
import { KOYNLABS_DISCORD_URL, KOYNLABS_TELEGRAM_URL } from "@/lib/community";

const HERO_LEAD = "Agentic Solana desk.";
const HERO_BODY =
  "Organic score ranks the board. A momentum ring on the logo follows 24-hour volume, and the newest print sets its pace. Market, limit, and DCA settle from your wallet. The same desk, and the labs launcher, attach to Claude.";
const LABS_MCP_URL = `${SITE_URL}/mcp`;
const TRADE_MCP_URL = "https://koyn.trade/mcp";
import { findTape, tapes, type Tape } from "@/config/tapes";

export type LineTone = "default" | "dim" | "accent" | "error" | "ok";

export type OutputLine = {
  text: string;
  tone?: LineTone;
  /** Same-site path; the whole line becomes a link. */
  href?: string;
};

export type PlayerControl = "pause" | "next" | "prev" | "mute";

export type CommandResult = {
  lines: OutputLine[];
  openUrl?: string;
  /** Same-tab route change. */
  navigate?: string;
  showHeatmap?: boolean;
  copied?: string;
  ask?: string;
  playTape?: Tape;
  control?: PlayerControl;
};

const HELP: OutputLine[] = [
  { text: "available commands", tone: "accent" },
  { text: "  help          list commands" },
  { text: "  about         what this is" },
  { text: "  manifesto     longer dump" },
  { text: "  trade         open the board" },
  { text: "  perps         SOL, ETH, BTC perps" },
  { text: "  docs          agent brief" },
  { text: "  map           gainers / losers" },
  { text: "  play          run a tape from /dev/brainrot" },
  { text: "  tapes         list /dev/brainrot" },
  { text: "  socials       x / telegram / discord" },
  { text: "  labs          launch and trade agents" },
  { text: "  ask           ask labs" },
  { text: "  status        launch state" },
  { text: "  clear         wipe buffer" },
  { text: "  ls            alias for help" },
];

const ABOUT: OutputLine[] = [
  { text: `labs. ${HERO_LEAD}`, tone: "accent" },
  { text: HERO_BODY },
];

const MANIFESTO: OutputLine[] = [
  { text: "# manifesto", tone: "accent" },
  { text: "The banks use leverage. Fees go to holders in the paired stock." },
  { text: "leverage is just a ratio until it is a religion." },
  { text: "we mint on solana because confirmation is cheap" },
  { text: "and attention is not." },
  { text: "" },
  { text: "there is no team theater." },
  { text: "there is a desk, a chain, and a command line." },
];

export function runCommand(raw: string): CommandResult | { clear: true } {
  const input = raw.trim();
  if (!input) return { lines: [] };

  const [cmd] = input.split(/\s+/);
  const key = cmd.toLowerCase();

  if (key === "clear") return { clear: true };

  if (key === "help" || key === "ls" || key === "?") {
    return { lines: HELP };
  }

  if (key === "about" || key === "whoami") {
    return { lines: ABOUT };
  }

  if (key === "manifesto") {
    return { lines: MANIFESTO };
  }

  if (key === "trade" || key === "swap") {
    return {
      lines: [{ text: "opening the board …", tone: "dim" }],
      openUrl: deskHref("/tokens"),
    };
  }

  if (key === "perps" || key === "perp") {
    return {
      lines: [{ text: "opening perps …", tone: "dim" }],
      openUrl: deskHref("/trade/perps"),
    };
  }

  if (key === "docs" || key === "doc") {
    return {
      lines: [{ text: "opening the desk docs …", tone: "dim" }],
      openUrl: deskHref("/docs"),
    };
  }

  if (key === "map" || key === "heat") {
    return {
      lines: [{ text: "loading heatmap…", tone: "dim" }],
      showHeatmap: true,
    };
  }

  if (key === "play" || key === "video" || key === "brainrot") {
    if (!tapes.length) {
      return {
        lines: [
          { text: "/dev/brainrot: no tapes.", tone: "dim" },
          { text: "the rot is still rendering. check back.", tone: "dim" },
        ],
      };
    }
    const [, arg] = input.split(/\s+/);
    const tape = findTape(arg);
    if (!tape) {
      return {
        lines: [
          { text: `no such tape: ${arg}`, tone: "error" },
          { text: "type `tapes` to list /dev/brainrot.", tone: "dim" },
        ],
      };
    }
    return {
      lines: [
        { text: `opening /dev/brainrot/${tape.id} …`, tone: "dim" },
      ],
      playTape: tape,
    };
  }

  if (key === "tapes") {
    if (!tapes.length) {
      return { lines: [{ text: "/dev/brainrot: no tapes.", tone: "dim" }] };
    }
    return {
      lines: [
        { text: "ls /dev/brainrot", tone: "dim" },
        ...tapes.map((t, i) => ({
          text: `  ${String(i + 1).padStart(2, "0")}  ${t.id.padEnd(12)} ${t.title}`,
        })),
        { text: "play <n|id> to run one.", tone: "dim" },
      ],
    };
  }

  if (key === "pause" || key === "next" || key === "prev" || key === "mute") {
    return { lines: [], control: key };
  }

  if (key === "labs" || key === "mcp") {
    return {
      lines: [
        { text: `launch  ${LABS_MCP_URL}`, tone: "ok" },
        { text: `agent   ${TRADE_MCP_URL}` },
      ],
    };
  }

  if (key === "socials") {
    const twitter = displayOrPending(token.twitter);
    const extraTelegram = telegramUrl(token.telegram);
    return {
      lines: [
        { text: `x         ${twitter}` },
        { text: `telegram  ${KOYNLABS_TELEGRAM_URL}` },
        ...(extraTelegram && extraTelegram !== KOYNLABS_TELEGRAM_URL
          ? [{ text: `telegram  ${extraTelegram}` }]
          : []),
        { text: `discord   ${KOYNLABS_DISCORD_URL}` },
      ],
    };
  }

  if (key === "ask") {
    const question = input.slice(cmd.length).trim();
    return { lines: [], ask: question };
  }

  if (key === "status") {
    return {
      lines: [
        { text: "host       labs-terminal", tone: "accent" },
        { text: `launch     ${LABS_MCP_URL}` },
        { text: `agent      ${TRADE_MCP_URL}` },
      ],
    };
  }

  return {
    lines: [
      { text: `command not found: ${cmd}`, tone: "error" },
      { text: "type `help` for available commands.", tone: "dim" },
    ],
  };
}
