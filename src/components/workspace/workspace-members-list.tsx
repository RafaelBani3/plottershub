"use client";

import * as React from "react";
import { useWorkspace } from "./workspace-provider";
import { WorkspaceRole } from "@/lib/auth/rbac";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UserPlus, Trash2, ShieldAlert, CheckCircle2 } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface MemberItem {
  id: string;
  role: WorkspaceRole;
  createdAt: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
  };
}

export function WorkspaceMembersList() {
  const { currentWorkspace, currentRole } = useWorkspace();
  const [members, setMembers] = React.useState<MemberItem[]>([]);
  const [isInviteOpen, setIsInviteOpen] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<WorkspaceRole>("VIEWER");
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const canManageMembers = currentRole === "OWNER" || currentRole === "ADMIN";

  const fetchMembers = React.useCallback(async () => {
    if (!currentWorkspace) return;
    try {
      const res = await fetch(`/api/workspaces/${currentWorkspace.id}/members`);
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members || []);
      }
    } catch (err) {
      console.error("Failed to load members:", err);
    }
  }, [currentWorkspace]);

  React.useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWorkspace || !inviteEmail) return;

    try {
      setIsSubmitting(true);
      setError(null);
      setSuccess(null);

      const res = await fetch(`/api/workspaces/${currentWorkspace.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to invite member");
      }

      setSuccess(`Invited ${inviteEmail} successfully.`);
      setInviteEmail("");
      setIsInviteOpen(false);
      fetchMembers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRoleChange = async (memberId: string, newRole: WorkspaceRole) => {
    if (!currentWorkspace) return;
    try {
      setError(null);
      const res = await fetch(`/api/workspaces/${currentWorkspace.id}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update role");
      }
      fetchMembers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!currentWorkspace || !confirm("Are you sure you want to remove this member?")) return;
    try {
      setError(null);
      const res = await fetch(`/api/workspaces/${currentWorkspace.id}/members/${memberId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to remove member");
      }
      fetchMembers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Team Members</h3>
          <p className="text-xs text-muted-foreground">
            Manage who has access to this workspace and assign role-based permissions.
          </p>
        </div>

        {canManageMembers && (
          <Button onClick={() => setIsInviteOpen(true)} size="sm" className="flex items-center space-x-1.5 text-xs">
            <UserPlus className="h-3.5 w-3.5" />
            <span>Invite Member</span>
          </Button>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-md border border-negative/25 bg-negative/10 text-negative text-xs flex items-center space-x-2.5">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3 rounded-md border border-positive/25 bg-positive/10 text-positive text-xs flex items-center space-x-2.5">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Joined</TableHead>
            {canManageMembers && <TableHead className="text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((m) => (
            <TableRow key={m.id}>
              <TableCell>
                <div className="flex items-center space-x-2.5">
                  <Avatar
                    src={m.user.image}
                    fallback={m.user.name || m.user.email}
                    size="sm"
                  />
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground text-xs">
                      {m.user.name || "Nameless User"}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{m.user.email}</span>
                  </div>
                </div>
              </TableCell>

              <TableCell>
                {canManageMembers && m.role !== "OWNER" ? (
                  <Select
                    value={m.role}
                    onChange={(e) => handleRoleChange(m.id, e.target.value as WorkspaceRole)}
                    className="w-28 h-7 text-xs bg-surface border-border-strong"
                  >
                    <option value="ADMIN">ADMIN</option>
                    <option value="EDITOR">EDITOR</option>
                    <option value="ANALYST">ANALYST</option>
                    <option value="VIEWER">VIEWER</option>
                  </Select>
                ) : (
                  <Badge
                    variant={
                      m.role === "OWNER"
                        ? "default"
                        : m.role === "ADMIN"
                        ? "secondary"
                        : "outline"
                    }
                  >
                    {m.role}
                  </Badge>
                )}
              </TableCell>

              <TableCell className="text-xs text-slate-400">
                {formatDate(m.createdAt)}
              </TableCell>

              {canManageMembers && (
                <TableCell className="text-right">
                  {m.role !== "OWNER" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveMember(m.id)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 px-2"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Invite Member Dialog */}
      <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
        <DialogContent onClose={() => setIsInviteOpen(false)}>
          <form onSubmit={handleInvite}>
            <DialogHeader>
              <DialogTitle>Invite Member to Workspace</DialogTitle>
              <DialogDescription>
                Add an existing registered user by their email address and assign an RBAC role.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="inviteEmail">User Email</Label>
                <Input
                  id="inviteEmail"
                  type="email"
                  placeholder="collaborator@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="inviteRole">Assigned Role</Label>
                <Select
                  id="inviteRole"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as WorkspaceRole)}
                >
                  <option value="ADMIN">ADMIN — Full management & publishing</option>
                  <option value="EDITOR">EDITOR — Content creation & publishing</option>
                  <option value="ANALYST">ANALYST — Analytics & report generation</option>
                  <option value="VIEWER">VIEWER — Read-only analytics viewer</option>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsInviteOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Inviting..." : "Send Invite"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
