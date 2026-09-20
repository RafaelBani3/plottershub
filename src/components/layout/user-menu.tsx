"use client";

import * as React from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { LogOut, Settings, ShieldCheck } from "lucide-react";

export function UserMenu() {
  const { user, logout } = useAuth();

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center space-x-2 p-1 rounded-full hover:ring-1 hover:ring-focus transition-all focus:outline-none focus:ring-1 focus:ring-focus">
        <Avatar
          src={user.image}
          fallback={user.name || user.email}
          size="sm"
          className="border border-border-strong"
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52 p-1">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-0.5">
            <span className="text-xs font-semibold text-foreground truncate">
              {user.name || "User"}
            </span>
            <span className="text-[10px] text-muted-foreground font-normal lowercase truncate">
              {user.email}
            </span>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <Link href="/settings/security">
          <DropdownMenuItem>
            <ShieldCheck className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
            <span>Security & Access</span>
          </DropdownMenuItem>
        </Link>

        <Link href="/settings/workspace">
          <DropdownMenuItem>
            <Settings className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
            <span>Workspace Settings</span>
          </DropdownMenuItem>
        </Link>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={logout} destructive>
          <LogOut className="mr-2 h-3.5 w-3.5" />
          <span>Sign Out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
