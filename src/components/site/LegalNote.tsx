import Link from "next/link";
import { PageIntro } from "@/components/site/PageIntro";

const SECTIONS = [
  {
    id: "labs",
    title: "What labs does",
    text: "labs builds a launch, a trade, or a post and hands it back for you to confirm. Your wallet signs every transaction. A post goes out only after you confirm the draft. labs does not hold your funds and does not ask for a wallet private key.",
  },
  {
    id: "risk",
    title: "Risk",
    text: "You can lose all of your money on a launch, a swap, or a perp. This is not financial advice. Not for UK persons. You pay the network, and any opening buy you include. labs does not charge a subscription. You are responsible for the wallet you sign with and the X account you connect.",
  },
  {
    id: "keep",
    title: "What we keep",
    text: "The public wallet address on a signing link, so the transaction can be built for that wallet. A launch also creates a mint key, sealed until you have signed. That key holds no funds. Connecting X stores that account's tokens, sealed. The personal key from /x is shown once and kept only as a hash. A post is published only after you confirm the draft.",
  },
  {
    id: "dont",
    title: "What we don't",
    text: "We do not ask for a wallet private key. We do not sell what we see. The tools, the venues, and this note can change. If you keep using labs, you are on the current version.",
  },
] as const;

export default function LegalNote({ page }: { page: "terms" | "privacy" }) {
  const other = page === "terms" ? { href: "/privacy", label: "Privacy" } : { href: "/terms", label: "Terms" };
  return (
    <>
      <PageIntro eyebrow="labs" title={page === "terms" ? "Terms" : "Privacy"}>
        {page === "terms" ? "If you use labs, these are the terms." : "If you connect a wallet or X, these are the terms."}{" "}
        The <Link href={other.href}>{other.label.toLowerCase()}</Link> page says the same thing.
      </PageIntro>
      {SECTIONS.map((section) => (
        <section key={section.id} id={section.id}>
          <h2>{section.title}</h2>
          <p>{section.text}</p>
        </section>
      ))}
      <p className="legal-dated">
        21 October 2026. Questions: <a href="mailto:labs@levercoin.lol">dev@levercoin.lol</a>
      </p>
    </>
  );
}
