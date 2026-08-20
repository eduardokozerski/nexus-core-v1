import { AdminShell } from "@/app/components/admin-shell";
import { requireSession } from "@/src/server/auth/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  return <AdminShell email={session.email}>{children}</AdminShell>;
}
