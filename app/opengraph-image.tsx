import { ImageResponse } from "next/og";
import { COMPANY } from "@/lib/config/company";
import { ogImageElement, OG_SIZE } from "@/lib/og/element";

// Default English fallback OG image (used by non-locale routes).
// Locale-prefixed pages get their own image from app/[locale]/opengraph-image.tsx.
export const runtime = "edge";
export const alt = `${COMPANY.shortName} · Metabolic Psychiatry & Systemic Longevity · ${COMPANY.address.city}`;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    ogImageElement({ tagline: "Metabolic Psychiatry & Systemic Longevity" }),
    { ...size },
  );
}
