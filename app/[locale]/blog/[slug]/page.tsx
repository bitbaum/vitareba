import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import Nav from "@/components/sections/Nav";
import Footer from "@/components/sections/Footer";
import { Link } from "@/lib/i18n/navigation";
import { BLOG_POSTS, getBlogPost, type Locale } from "@/lib/blog/posts";
import { formatDateLong } from "@/lib/utils/format";
import { COMPANY } from "@/lib/config/company";
import styles from "../blog.module.css";

type Props = { params: Promise<{ locale: string; slug: string }> };

export function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return {};
  const t = post.translations[locale as Locale];
  return { title: `${t.title} · ${COMPANY.shortName}`, description: t.excerpt };
}

export default async function BlogPostPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const post = getBlogPost(slug);
  if (!post) notFound();
  const t = post.translations[locale as Locale];

  return (
    <>
      <Nav />
      <main>
        <div className={styles.postWrap}>
          <div className={styles.postInner}>
            <Link href="/blog" className={styles.back}>
              ← Blog
            </Link>
            <p className={styles.postDate}>{formatDateLong(post.publishedAt)}</p>
            <h1 className={styles.postTitle}>{t.title}</h1>
            <div className={styles.postBody}>
              {t.body.map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
