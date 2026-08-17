"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { Link } from "@/lib/i18n/navigation";
import NextLink from "next/link";
import Logo from "@/components/Logo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import styles from "./Nav.module.css";
import { COMPANY } from "@/lib/config/company";
import { PORTAL_ROUTES, AUTH_ROUTES } from "@/lib/config/routes";

// Structural config — hrefs only; labels come from translations (nav.mega)
const MEGA_HREFS = {
  programmes: ["#pillars", "#pillars", "#pillars"] as const,
  approach: ["#approach", "#approach", "#approach", "#approach"] as const,
  diagnostics: ["#diagnostics", "#diagnostics", "#diagnostics"] as const,
} as const;

type MegaItem = { label: string; sub?: string };

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

  const sectionLinks = [
    { href: "#pillars", label: t("programmes") },
    { href: "#approach", label: t("approach") },
    { href: "#diagnostics", label: t("diagnostics") },
    { href: "#longevity", label: t("longevity") },
    { href: "#pricing", label: t("pricing") },
    { href: "#team", label: t("team") },
  ];

  return (
    <nav className={styles.nav}>
      <Link href="/" className={styles.logoLink} aria-label={`${COMPANY.shortName} — home`}>
        <Logo />
      </Link>

      <div className={styles.navLinks}>
        {/* PROGRAMMES — megamenu */}
        <div className={styles.megaItem}>
          <a href="#pillars" className={styles.megaTrigger}>
            {t("programmes")}
            <svg className={styles.chevron} width="9" height="9" viewBox="0 0 9 9" fill="none">
              <path d="M1.5 3L4.5 6L7.5 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
          <div className={styles.megaPanel}>
            <div className={styles.megaPanelInner}>
              <div className={styles.megaCards}>
                {mega.programmes.map((item, i) => (
                  <a key={item.label} href={MEGA_HREFS.programmes[i]} className={styles.megaCard}>
                    <span className={styles.megaCardLabel}>{item.label}</span>
                    {item.sub && <span className={styles.megaCardSub}>{item.sub}</span>}
                  </a>
                ))}
              </div>
              <div className={styles.megaPanelFooter}>
                <a href="#pillars" className={styles.megaFooterLink}>{mega.programmesFooter}</a>
              </div>
            </div>
          </div>
        </div>

        {/* APPROACH — megamenu */}
        <div className={styles.megaItem}>
          <a href="#approach" className={styles.megaTrigger}>
            {t("approach")}
            <svg className={styles.chevron} width="9" height="9" viewBox="0 0 9 9" fill="none">
              <path d="M1.5 3L4.5 6L7.5 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
          <div className={styles.megaPanel}>
            <div className={styles.megaPanelInner}>
              <div className={styles.megaList}>
                {mega.approach.map((label, i) => (
                  <a key={label} href={MEGA_HREFS.approach[i]} className={styles.megaListItem}>
                    {label}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* DIAGNOSTICS — megamenu */}
        <div className={styles.megaItem}>
          <a href="#diagnostics" className={styles.megaTrigger}>
            {t("diagnostics")}
            <svg className={styles.chevron} width="9" height="9" viewBox="0 0 9 9" fill="none">
              <path d="M1.5 3L4.5 6L7.5 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
          <div className={styles.megaPanel}>
            <div className={styles.megaPanelInner}>
              <div className={styles.megaList}>
                {mega.diagnostics.map((label, i) => (
                  <a key={label} href={MEGA_HREFS.diagnostics[i]} className={styles.megaListItem}>
                    {label}
                  </a>
                ))}
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
        {session ? (
          <NextLink href={PORTAL_ROUTES.dashboard} className={styles.navBtn}>
            {t("dashboard")} &rarr;
          </NextLink>
        ) : (
          <>
            <Link href={AUTH_ROUTES.login} className={styles.navSignIn}>
              {t("signIn")}
            </Link>
            <a href="?assessment=open" className={styles.navBtn}>
              {t("cta")}
            </a>
          </>
        )}
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
          <div className={styles.mobileMenuActions}>
            {session ? (
              <NextLink href={PORTAL_ROUTES.dashboard} className={styles.mobileMenuBtn} onClick={closeMenu}>
                {t("dashboard")} &rarr;
              </NextLink>
            ) : (
              <>
                <a href="?assessment=open" className={styles.mobileMenuBtn} onClick={closeMenu}>
                  {t("cta")}
                </a>
                <Link href={AUTH_ROUTES.login} className={styles.mobileMenuSignIn} onClick={closeMenu}>
                  {t("signIn")}
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
