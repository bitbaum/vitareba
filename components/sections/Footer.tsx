import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { COMPANY, EMERGENCY_CONTACTS } from "@/lib/config/company";
import { AUTH_ROUTES } from "@/lib/config/routes";
import { MARKETING_SECTION_LINKS } from "@/lib/config/marketing-nav";
import Logo from "@/components/Logo";
import styles from "./Footer.module.css";

export default async function Footer() {
  const [tFooter, tNav] = await Promise.all([
    getTranslations("footer"),
    getTranslations("nav"),
  ]);

  return (
    <footer className={styles.footer}>
      <div className={styles.grid}>
        <div className={styles.brandCol}>
          <Logo variant="light" tagline={COMPANY.partnerBrand} small />
          <address className={styles.address}>
            {COMPANY.address.street}
            <br />
            {COMPANY.address.zip} {COMPANY.address.city}
          </address>
          <a href={`tel:${COMPANY.phone.replace(/\s+/g, "")}`} className={styles.contactLink}>
            {COMPANY.phone}
          </a>
          <a href={`mailto:${COMPANY.email}`} className={styles.contactLink}>
            {COMPANY.email}
          </a>
        </div>

        <div className={styles.col}>
          <p className={styles.colHeading}>{tFooter("exploreHeading")}</p>
          {MARKETING_SECTION_LINKS.map(({ href, key }) => (
            <a key={href} href={href} className={styles.colLink}>
              {tNav(key)}
            </a>
          ))}
          <Link href="/blog" className={styles.colLink}>
            {tNav("blog")}
          </Link>
        </div>

        <div className={styles.col}>
          <p className={styles.colHeading}>{tFooter("accountHeading")}</p>
          <Link href={AUTH_ROUTES.login} className={styles.colLink}>
            {tNav("signIn")}
          </Link>
          <p className={styles.emergency}>
            <span className={styles.emergencyLabel}>{tFooter("emergencyLabel")}</span>
            {EMERGENCY_CONTACTS.map((c) => (
              <span key={`${c.region}-${c.number}`} className={styles.emergencyEntry}>
                {c.number} <span className={styles.emergencyRegion}>({c.region})</span>
              </span>
            ))}
          </p>
        </div>
      </div>

      <div className={styles.bottomBar}>
        © {COMPANY.foundingYear} {COMPANY.name} · {tFooter("legal")}
      </div>
    </footer>
  );
}
