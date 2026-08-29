// Structural SSOT for the marketing site's section anchors — hrefs + the
// `nav` i18n key for each label. Shared by Nav.tsx (the nav bar) and
// Footer.tsx (the "Explore" column): both used to define their own copy of
// this list, which is the same list by definition, not just similarly shaped.
export const MARKETING_SECTION_LINKS = [
  { href: "#pillars", key: "programmes" },
  { href: "#approach", key: "approach" },
  { href: "#diagnostics", key: "diagnostics" },
  { href: "#longevity", key: "longevity" },
  { href: "#pricing", key: "pricing" },
  { href: "#team", key: "team" },
] as const;
