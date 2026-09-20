"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { useMobileNav } from "./mobile-nav-context";
import {
  LayoutDashboard,
  Share2,
  FolderKanban,
  CalendarDays,
  LineChart,
  FileSpreadsheet,
  Settings,
  ShieldCheck,
  History,
  Layers,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export function AppSidebar() {
  const pathname = usePathname();
  const { currentWorkspace, currentRole } = useWorkspace();
  const { isOpen, close } = useMobileNav();

  interface NavItem {
    title: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string;
  }

  const mainNav: NavItem[] = [
    {
      title: "Dashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
    },
    {
      title: "Content Library",
      href: "/content",
      icon: FolderKanban,
    },
    {
      title: "Calendar",
      href: "/calendar",
      icon: CalendarDays,
    },
    {
      title: "Analytics",
      href: "/analytics",
      icon: LineChart,
    },
    {
      title: "Reports",
      href: "/reports",
      icon: FileSpreadsheet,
    },
    {
      title: "Social Accounts",
      href: "/social-accounts",
      icon: Share2,
    },
  ];

  const settingsNav = [
    {
      title: "Workspace & Team",
      href: "/settings/workspace",
      icon: Settings,
    },
    {
      title: "Security & Access",
      href: "/settings/security",
      icon: ShieldCheck,
    },
    {
      title: "Audit Logs",
      href: "/settings/audit-logs",
      icon: History,
      ownerAdminOnly: true,
    },
  ];

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 lg:hidden transition-opacity"
          onClick={close}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-screen w-60 flex-col border-r border-border-subtle bg-surface p-3 transition-transform duration-200 ease-in-out",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between px-2 py-2 mb-3">
          <div className="flex items-center space-x-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md border border-border-strong bg-elevated text-foreground">
              <Layers className="h-4 w-4" />
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-xs tracking-tight text-foreground">
                Plottershub
              </span>
              <span className="text-[10px] text-muted-foreground tracking-wider uppercase font-mono">
                Analytics Workspace
              </span>
            </div>
          </div>
          {/* Close button for mobile */}
          <button
            type="button"
            onClick={close}
            className="flex lg:hidden h-7 w-7 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-hover transition-colors"
            aria-label="Close navigation menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation Sections */}
        <div className="flex-1 space-y-4 overflow-y-auto px-1 py-1">
          <div>
            <div className="px-2 mb-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
              Operations
            </div>
            <nav className="space-y-0.5">
              {mainNav.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={close}
                    className={cn(
                      "group flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                      isActive
                        ? "bg-elevated text-foreground border border-border-strong font-semibold"
                        : "text-muted-foreground hover:bg-hover hover:text-foreground"
                    )}
                  >
                    <div className="flex items-center space-x-2.5">
                      <Icon
                        className={cn(
                          "h-3.5 w-3.5 transition-colors",
                          isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                        )}
                      />
                      <span>{item.title}</span>
                    </div>
                    {item.badge && (
                      <Badge variant="outline" className="text-[9px] py-0 px-1 border-border-subtle text-muted-foreground">
                        {item.badge}
                      </Badge>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div>
            <div className="px-2 mb-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
              Governance
            </div>
            <nav className="space-y-0.5">
              {settingsNav.map((item) => {
                if (item.ownerAdminOnly && currentRole !== "OWNER" && currentRole !== "ADMIN") {
                  return null;
                }
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={close}
                    className={cn(
                      "group flex items-center space-x-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                      isActive
                        ? "bg-elevated text-foreground border border-border-strong font-semibold"
                        : "text-muted-foreground hover:bg-hover hover:text-foreground"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-3.5 w-3.5 transition-colors",
                        isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                      )}
                    />
                    <span>{item.title}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Workspace Context Footer */}
        {currentWorkspace && (
          <div className="pt-2.5 border-t border-border-subtle">
            <div className="p-2 rounded-md bg-elevated border border-border-subtle flex items-center justify-between">
              <div className="flex flex-col truncate pr-2">
                <span className="text-xs font-medium text-foreground truncate">
                  {currentWorkspace.name}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Active Workspace
                </span>
              </div>
              <Badge
                variant={
                  currentRole === "OWNER"
                    ? "default"
                    : currentRole === "ADMIN"
                    ? "secondary"
                    : "outline"
                }
                className="text-[9px] px-1.5 py-0 uppercase"
              >
                {currentRole || "MEMBER"}
              </Badge>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
