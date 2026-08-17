import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import Nav from "@/components/sections/Nav";
import Footer from "@/components/sections/Footer";
import { Link } from "@/lib/i18n/navigation";
import { BLOG_POSTS, type Locale } from "@/lib/blog/posts";
import { formatDateLong } from "@/lib/utils/format";
import { COMPANY } from "@/lib/config/company";
import styles from "./blog.module.css";

type Props = { params: Promise<{ locale: string }> };

export function generateMetadata(): Metadata {
  return { title: `Blog · ${COMPANY.shortName}` };
}

export default async function BlogIndexPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;

  return (
    <>
      <Nav />
      <main>
        <div className={styles.hero}>
          <div className="eyebrow">Blog</div>
          <h1 className="sec-title sec-title-center">
            What we&apos;re <em>building</em>, and why
          </h1>
        </div>

        <div className="section-inner">
          <div className={styles.list}>
            {BLOG_POSTS.map((post) => {
              const t = post.translations[l];
              return (
                <Link key={post.slug} href={`/blog/${post.slug}`} className={styles.card}>
                  <p className={styles.cardDate}>{formatDateLong(post.publishedAt)}</p>
                  <h2 className={styles.cardTitle}>{t.title}</h2>
                  <p className={styles.cardExcerpt}>{t.excerpt}</p>
                </Link>
              );
            })}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
