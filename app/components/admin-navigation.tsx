"use client";

import {
  BadgeCheck,
  ChartNoAxesCombined,
  History,
  LayoutDashboard,
  Radar,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/dashboard", label: "Visão geral", icon: LayoutDashboard },
  { href: "/search-terms", label: "Radar de categorias", icon: Radar },
  { href: "/runs", label: "Execuções", icon: History },
  { href: "/candidates", label: "Candidatos", icon: ChartNoAxesCombined },
  { href: "/validated-products", label: "Produtos validados", icon: BadgeCheck },
  { href: "/settings/integration", label: "Integração", icon: Settings },
];

export function AdminNavigation() {
  const pathname = usePathname();

  return (
    <nav aria-label="Navegação principal" className="sidebar-nav">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className="nav-link"
            data-active={active}
            href={href}
            key={href}
          >
            <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
