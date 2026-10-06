import { SITE_URL } from "@/lib/config";
import { FAQ, SITE } from "@/lib/site";

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
          price: "0",
          priceCurrency: "SOL",
          description: "No launch fee. No subscription.",
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
