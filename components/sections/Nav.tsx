"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { Link } from "@/lib/i18n/navigation";
import Logo from "@/components/Logo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { NavAuthActions } from "@/components/sections/NavAuthActions";
import styles from "./Nav.module.css";
import { COMPANY } from "@/lib/config/company";
import { MARKETING_SECTION_LINKS } from "@/lib/config/marketing-nav";
import { useClickOutside } from "@/lib/hooks/useClickOutside";

// Structural config — hrefs only; labels come from translations (nav.mega)
const MEGA_HREFS = {
  programmes: ["#pillars", "#pillars", "#pillars"] as const,
  approach: ["#approach", "#approach", "#approach", "#approach"] as const,
  diagnostics: ["#diagnostics", "#diagnostics", "#diagnostics"] as const,
} as const;

type MegaItem = { label: string; sub?: string };
type MegaKey = "programmes" | "approach" | "diagnostics";

export default function Nav() {
  const t = useTranslations("nav");
  const mega = t.raw("mega") as {
    programmesFooter: string;
    programmes: MegaItem[];
    approach: string[];
    diagnostics: string[];
  };
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  // Which mega panel is open — click/focus driven, not hover. Hover alone
  // never worked on a tablet or hybrid laptop, and reconciling a hover-open
  // state against a deliberate click-close was more complexity than it was
  // worth, so this is the only way in on every device now.
  const [openMega, setOpenMega] = useState<MegaKey | null>(null);
  const megaGroupRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Record<MegaKey, HTMLButtonElement | null>>({
    programmes: null,
    approach: null,
    diagnostics: null,
  });
  const panelRefs = useRef<Record<MegaKey, HTMLDivElement | null>>({
    programmes: null,
    approach: null,
    diagnostics: null,
  });
  const prevOpenMega = useRef<MegaKey | null>(null);

  useClickOutside(megaGroupRef, () => setOpenMega(null));

  // Move focus into the panel on open, back to its trigger on close — never
  // silently drop focus into the page body.
  useEffect(() => {
    if (openMega) {
      const focusable = panelRefs.current[openMega]?.querySelector<HTMLElement>("a, button");
      focusable?.focus();
    } else if (prevOpenMega.current) {
      triggerRefs.current[prevOpenMega.current]?.focus();
    }
    prevOpenMega.current = openMega;
  }, [openMega]);

  function toggleMega(key: MegaKey) {
    setOpenMega((current) => (current === key ? null : key));
  }

  // Lock body scroll while the mobile menu is open; Escape closes it
  useEffect(() => {
    if (!menuOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);
  const authLabels = { dashboard: t("dashboard"), signIn: t("signIn"), cta: t("cta") };

  const sectionLinks = MARKETING_SECTION_LINKS.map(({ href, key }) => ({ href, label: t(key) }));

  return (
    <nav className={styles.nav}>
      <Link href="/" className={styles.logoLink} aria-label={`${COMPANY.shortName} — home`}>
        <Logo />
      </Link>

      <div className={styles.navLinks}>
        <div ref={megaGroupRef} className={styles.megaGroup}>
          {/* PROGRAMMES — megamenu */}
          <div className={styles.megaItem}>
            <button
              type="button"
              ref={(el) => { triggerRefs.current.programmes = el; }}
              className={styles.megaTrigger}
              aria-expanded={openMega === "programmes"}
              aria-controls="mega-programmes"
              onClick={() => toggleMega("programmes")}
            >
              {t("programmes")}
              <svg className={styles.chevron} width="9" height="9" viewBox="0 0 9 9" fill="none">
                <path d="M1.5 3L4.5 6L7.5 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <div
              id="mega-programmes"
              ref={(el) => { panelRefs.current.programmes = el; }}
              className={openMega === "programmes" ? `${styles.megaPanel} ${styles.megaPanelOpen}` : styles.megaPanel}
            >
              <div className={styles.megaPanelInner}>
                <div className={styles.megaCards}>
                  {mega.programmes.map((item, i) => (
                    <a
                      key={item.label}
                      href={MEGA_HREFS.programmes[i]}
                      className={styles.megaCard}
                      onClick={() => setOpenMega(null)}
                    >
                      <span className={styles.megaCardLabel}>{item.label}</span>
                      {item.sub && <span className={styles.megaCardSub}>{item.sub}</span>}
                    </a>
                  ))}
                </div>
                <div className={styles.megaPanelFooter}>
                  <a href="#pillars" className={styles.megaFooterLink} onClick={() => setOpenMega(null)}>
                    {mega.programmesFooter}
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* APPROACH — megamenu */}
          <div className={styles.megaItem}>
            <button
              type="button"
              ref={(el) => { triggerRefs.current.approach = el; }}
              className={styles.megaTrigger}
              aria-expanded={openMega === "approach"}
              aria-controls="mega-approach"
              onClick={() => toggleMega("approach")}
            >
              {t("approach")}
              <svg className={styles.chevron} width="9" height="9" viewBox="0 0 9 9" fill="none">
                <path d="M1.5 3L4.5 6L7.5 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <div
              id="mega-approach"
              ref={(el) => { panelRefs.current.approach = el; }}
              className={openMega === "approach" ? `${styles.megaPanel} ${styles.megaPanelOpen}` : styles.megaPanel}
            >
              <div className={styles.megaPanelInner}>
                <div className={styles.megaList}>
                  {mega.approach.map((label, i) => (
                    <a
                      key={label}
                      href={MEGA_HREFS.approach[i]}
                      className={styles.megaListItem}
                      onClick={() => setOpenMega(null)}
                    >
                      {label}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* DIAGNOSTICS — megamenu */}
          <div className={styles.megaItem}>
            <button
              type="button"
              ref={(el) => { triggerRefs.current.diagnostics = el; }}
              className={styles.megaTrigger}
              aria-expanded={openMega === "diagnostics"}
              aria-controls="mega-diagnostics"
              onClick={() => toggleMega("diagnostics")}
            >
              {t("diagnostics")}
              <svg className={styles.chevron} width="9" height="9" viewBox="0 0 9 9" fill="none">
                <path d="M1.5 3L4.5 6L7.5 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <div
              id="mega-diagnostics"
              ref={(el) => { panelRefs.current.diagnostics = el; }}
              className={openMega === "diagnostics" ? `${styles.megaPanel} ${styles.megaPanelOpen}` : styles.megaPanel}
            >
              <div className={styles.megaPanelInner}>
                <div className={styles.megaList}>
                  {mega.diagnostics.map((label, i) => (
                    <a
                      key={label}
                      href={MEGA_HREFS.diagnostics[i]}
                      className={styles.megaListItem}
                      onClick={() => setOpenMega(null)}
                    >
                      {label}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Simple links */}
        <a href="#longevity" className={styles.navLink}>{t("longevity")}</a>
        <a href="#pricing"   className={styles.navLink}>{t("pricing")}</a>
        <a href="#team"      className={styles.navLink}>{t("team")}</a>
        <Link href="/blog"   className={styles.navLink}>{t("blog")}</Link>
      </div>

      <div className={styles.navActions}>
        <LanguageSwitcher />
        <NavAuthActions session={session} variant="desktop" labels={authLabels} />
        <button
          type="button"
          className={styles.menuToggle}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          aria-label={menuOpen ? t("menuClose") : t("menuOpen")}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            {menuOpen ? (
              <path d="M4 4L16 16M16 4L4 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            ) : (
              <path d="M3 5.5H17M3 10H17M3 14.5H17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>

      {menuOpen && (
        <div id="mobile-menu" className={styles.mobileMenu}>
          <div className={styles.mobileMenuLinks}>
            {sectionLinks.map(({ href, label }) => (
              <a key={href} href={href} className={styles.mobileMenuLink} onClick={closeMenu}>
                {label}
              </a>
            ))}
            <Link href="/blog" className={styles.mobileMenuLink} onClick={closeMenu}>
              {t("blog")}
            </Link>
          </div>
          <NavAuthActions session={session} variant="mobile" onNavigate={closeMenu} labels={authLabels} />
        </div>
      )}
    </nav>
  );
}
