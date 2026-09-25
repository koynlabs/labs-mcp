import { FEE_SOL, SITE_URL } from "@/lib/config";
import { FAQ, HOLD_WAIVES_FEE, SITE } from "@/lib/site";

export default function JsonLd() {
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: SITE.name,
        url: SITE_URL,
        description: SITE.description,
        inLanguage: "en-US",
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#app`,
        name: "labs",
        applicationCategory: "FinanceApplication",
        operatingSystem: "Web",
        url: SITE_URL,
        description: SITE.description,
        offers: {
          "@type": "Offer",
          price: String(FEE_SOL),
          priceCurrency: "SOL",
          description: HOLD_WAIVES_FEE
            ? `Per launch, paid inside the same bundle. Waived entirely when the paying wallet holds ${FEE_SOL} SOL worth of $LEVERCOIN. No subscription.`
            : "Per launch. Paid inside the same bundle. No subscription.",
        },
      },
      {
        "@type": "FAQPage",
        "@id": `${SITE_URL}/#faq`,
        mainEntity: FAQ.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
