import { auth } from "@/lib/auth";
import { PortalPageHeader } from "@/components/portal/PortalPageHeader";
import { CareTeamPanel } from "./CareTeamPanel";

export default async function CareTeamPage() {
  const session = await auth();

  return (
    <div>
      <PortalPageHeader
        title={<>My <em>Care Team</em></>}
        subtitle="Who treats you, and how to reach them. Choose a clinician, switch to another, message them directly, or book your next appointment."
      />
      <CareTeamPanel selfId={session?.user?.id ?? ""} />
    </div>
  );
}
