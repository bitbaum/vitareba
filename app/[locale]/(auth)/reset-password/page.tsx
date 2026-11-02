import { redirect } from "next/navigation";
import { AUTH_ROUTES } from "@/lib/config/routes";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * AccountKit's reset links land on the sign-in page, which opens the step
 * that sets a new password. This address is kept for links mailed before the
 * move and for bookmarks: it forwards the token, and only the token.
 */
export default async function ResetPasswordPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const token = (await searchParams).token;
  const query = typeof token === "string" && token ? `?token=${encodeURIComponent(token)}` : "";
  redirect(`/${locale}${AUTH_ROUTES.login}${query}`);
}
