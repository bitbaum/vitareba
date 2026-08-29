import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config/company";
import { PORTAL_ROUTES, ADMIN_ROUTES } from "@/lib/config/routes";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Keep portal and admin out of search indices — derived from PORTAL_ROUTES and ADMIN_ROUTES SSOT
        disallow: [...Object.values(PORTAL_ROUTES), ADMIN_ROUTES.root, "/api/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
