"use client";

import * as React from "react";
import Link from "next/link";
import { useWorkspace } from "./workspace-provider";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function WorkspaceSwitcher() {
  const { workspaces, currentWorkspace, switchWorkspace, isLoading } = useWorkspace();

  if (isLoading || !currentWorkspace) {
    return (
      <div className="flex items-center space-x-2 px-2.5 py-1 rounded-md border border-border-subtle bg-elevated text-xs text-muted-foreground">
        <Building2 className="h-3.5 w-3.5 animate-pulse text-muted-foreground" />
        <span>Loading workspace...</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center justify-between space-x-2 px-2.5 py-1.5 rounded-md border border-border-subtle bg-elevated hover:bg-hover hover:border-border-strong transition-colors text-xs font-medium text-foreground min-w-[170px] sm:min-w-[200px] outline-none focus-visible:ring-1 focus-visible:ring-focus">
        <div className="flex items-center space-x-2 truncate">
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border-strong bg-surface text-foreground font-mono font-semibold text-[10px]">
            {currentWorkspace.name.substring(0, 2).toUpperCase()}
          </div>
          <div className="flex flex-col text-left truncate">
            <span className="truncate text-xs font-semibold text-foreground">
              {currentWorkspace.name}
            </span>
            <span className="text-[10px] text-muted-foreground capitalize">
              {currentWorkspace.currentUserRole.toLowerCase()}
            </span>
          </div>
        </div>
        <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-60 p-1">
        <DropdownMenuLabel>Workspaces ({workspaces.length})</DropdownMenuLabel>
        <div className="max-h-52 overflow-y-auto space-y-0.5">
          {workspaces.map((ws) => {
            const isSelected = ws.id === currentWorkspace.id;
            return (
              <DropdownMenuItem
                key={ws.id}
                onClick={() => switchWorkspace(ws.id)}
                className={`flex items-center justify-between p-1.5 rounded ${
                  isSelected ? "bg-hover font-medium border border-border-strong" : ""
                }`}
              >
                <div className="flex items-center space-x-2 truncate">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div className="truncate text-xs">
                    <div className="truncate font-medium">{ws.name}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{ws.slug}</div>
                  </div>
                </div>
                <div className="flex items-center space-x-1 shrink-0">
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                    {ws.currentUserRole}
                  </Badge>
                  {isSelected && <Check className="h-3.5 w-3.5 text-foreground" />}
                </div>
              </DropdownMenuItem>
            );
          })}
        </div>

        <DropdownMenuSeparator />

        <Link href="/workspaces/new" className="block">
          <DropdownMenuItem className="text-foreground hover:bg-hover">
            <Plus className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
            <span>Create New Workspace</span>
          </DropdownMenuItem>
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
