"use client";

import type { ComponentProps } from "react";
import { RecoveryForm } from "@/components/auth/AuthForms";
import { useRouter } from "@/lib/i18n/navigation";
import { AUTH_ROUTES } from "@/lib/config/routes";

type Props = Omit<ComponentProps<typeof RecoveryForm>, "onBack">;

export function RecoveryScreen(props: Props) {
  const router = useRouter();
  return <RecoveryForm {...props} onBack={() => router.push(AUTH_ROUTES.login)} />;
}
