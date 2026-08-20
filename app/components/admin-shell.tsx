import { LogOut, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { logoutAction } from "@/app/actions";
import { AdminNavigation } from "@/app/components/admin-navigation";
import { ThemeToggle } from "@/app/components/theme-toggle";
import darkLogo from "@/nxc-logo.png";
import lightLogo from "@/nxc-logo-b.png";

export function AdminShell({ email, children }: { email: string; children: React.ReactNode }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <Link aria-label="Nexus Core — Visão geral" href="/dashboard" className="brand">
            <Image alt="Nexus Core" className="brand-logo brand-logo-light" priority src={lightLogo} />
            <Image alt="Nexus Core" className="brand-logo brand-logo-dark" priority src={darkLogo} />
          </Link>
        </div>
        <div className="workspace-label">
          <div className="workspace-copy"><span>Workspace</span><strong>Opportunity Scanner</strong></div>
          <ThemeToggle className="workspace-theme-toggle" />
        </div>
        <AdminNavigation />
        <div className="sidebar-footer">
          <div className="user-summary"><span className="user-avatar"><ShieldCheck size={16} /></span><span><small>Administrador</small><strong>{email}</strong></span></div>
          <form action={logoutAction}><button className="logout-button" type="submit"><LogOut size={16} /><span>Sair</span></button></form>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
