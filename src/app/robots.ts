import { SITE_URL } from "@/lib/config";
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/sign/", "/maker/", "/api/"],
      },
      { userAgent: "GPTBot", allow: "/", disallow: ["/sign/", "/maker/", "/api/"] },
      { userAgent: "ChatGPT-User", allow: "/", disallow: ["/sign/", "/maker/", "/api/"] },
      { userAgent: "Google-Extended", allow: "/", disallow: ["/sign/", "/maker/", "/api/"] },
      { userAgent: "PerplexityBot", allow: "/", disallow: ["/sign/", "/maker/", "/api/"] },
      { userAgent: "Applebot-Extended", allow: "/", disallow: ["/sign/", "/maker/", "/api/"] },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
