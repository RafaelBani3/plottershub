"use client";

import * as React from "react";
import { WorkspaceSwitcher } from "@/components/workspace/workspace-switcher";
import { UserMenu } from "./user-menu";
import { Menu } from "lucide-react";
import { useMobileNav } from "./mobile-nav-context";

export function AppHeader() {
  const { toggle } = useMobileNav();

  return (
    <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-border-subtle bg-surface/95 px-3 sm:px-6 backdrop-blur-sm">
      <div className="flex items-center space-x-2.5 sm:space-x-3">
        {/* Hamburger Menu button for mobile/tablet */}
        <button
          type="button"
          onClick={toggle}
          className="flex lg:hidden h-8 w-8 items-center justify-center rounded-md border border-border-strong bg-elevated text-muted-foreground hover:text-foreground hover:bg-hover transition-colors focus:outline-none focus:ring-1 focus:ring-focus"
          aria-label="Open navigation menu"
        >
          <Menu className="h-4 w-4" />
        </button>
        <WorkspaceSwitcher />
      </div>

      <div className="flex items-center space-x-3">
        <UserMenu />
      </div>
    </header>
  );
}
