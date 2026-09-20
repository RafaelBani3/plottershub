"use client";

import * as React from "react";
import { WorkspaceRole } from "@/lib/auth/rbac";
import { useAuth } from "@/components/auth/auth-provider";

export interface WorkspaceWithRole {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  currentUserRole: WorkspaceRole;
  memberCount?: number;
  socialAccountCount?: number;
  contentCount?: number;
}

interface WorkspaceContextType {
  workspaces: WorkspaceWithRole[];
  currentWorkspace: WorkspaceWithRole | null;
  currentRole: WorkspaceRole | null;
  isLoading: boolean;
  switchWorkspace: (workspaceId: string) => void;
  refreshWorkspaces: () => Promise<void>;
}

const WorkspaceContext = React.createContext<WorkspaceContextType | undefined>(undefined);

const ACTIVE_WORKSPACE_KEY = "plottershub_active_workspace";

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = React.useState<WorkspaceWithRole[]>([]);
  const [currentWorkspaceId, setCurrentWorkspaceId] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const refreshWorkspaces = React.useCallback(async () => {
    if (!user) {
      setWorkspaces([]);
      setCurrentWorkspaceId(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const res = await fetch("/api/workspaces");
      if (res.ok) {
        const data = await res.json();
        const list: WorkspaceWithRole[] = data.workspaces || [];
        setWorkspaces(list);

        // Determine active workspace
        const savedId = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_WORKSPACE_KEY) : null;
        const exists = list.find((w) => w.id === savedId);

        if (exists) {
          setCurrentWorkspaceId(exists.id);
        } else if (list.length > 0) {
          setCurrentWorkspaceId(list[0].id);
          if (typeof window !== "undefined") {
            localStorage.setItem(ACTIVE_WORKSPACE_KEY, list[0].id);
          }
        } else {
          setCurrentWorkspaceId(null);
        }
      }
    } catch (err) {
      console.error("[WorkspaceProvider] Failed to load workspaces:", err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  React.useEffect(() => {
    refreshWorkspaces();
  }, [refreshWorkspaces]);

  const switchWorkspace = (workspaceId: string) => {
    const target = workspaces.find((w) => w.id === workspaceId);
    if (target) {
      setCurrentWorkspaceId(target.id);
      if (typeof window !== "undefined") {
        localStorage.setItem(ACTIVE_WORKSPACE_KEY, target.id);
      }
    }
  };

  const currentWorkspace = workspaces.find((w) => w.id === currentWorkspaceId) || null;
  const currentRole = currentWorkspace?.currentUserRole || null;

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        currentWorkspace,
        currentRole,
        isLoading,
        switchWorkspace,
        refreshWorkspaces,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = React.useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
}
