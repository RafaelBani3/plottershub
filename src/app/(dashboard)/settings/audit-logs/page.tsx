"use client";

import * as React from "react";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { History, Shield, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

interface AuditLogItem {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  details: any;
  createdAt: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  } | null;
}

export default function AuditLogsPage() {
  const { currentWorkspace, currentRole } = useWorkspace();
  const [logs, setLogs] = React.useState<AuditLogItem[]>([]);
  const [total, setTotal] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);

  const isOwnerOrAdmin = currentRole === "OWNER" || currentRole === "ADMIN";

  const fetchLogs = React.useCallback(async () => {
    if (!currentWorkspace || !isOwnerOrAdmin) return;
    try {
      setIsLoading(true);
      const res = await fetch(`/api/workspaces/${currentWorkspace.id}/audit-logs?limit=50`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error("Failed to load audit logs:", err);
    } finally {
      setIsLoading(false);
    }
  }, [currentWorkspace, isOwnerOrAdmin]);

  React.useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  if (!isOwnerOrAdmin) {
    return (
      <div className="p-8 text-center">
        <Shield className="h-12 w-12 text-slate-500 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-white mb-1">Access Restricted</h2>
        <p className="text-sm text-slate-400">
          Viewing workspace audit logs requires an OWNER or ADMIN role.
        </p>
      </div>
    );
  }

  const getActionBadgeVariant = (action: string) => {
    if (action.includes("FAILED") || action.includes("REMOVED") || action.includes("DELETED")) {
      return "destructive";
    }
    if (action.includes("CREATED") || action.includes("CONNECTED") || action.includes("PUBLISHED")) {
      return "success";
    }
    if (action.includes("ROLE") || action.includes("INVITED") || action.includes("UPDATED")) {
      return "warning";
    }
    return "default";
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Workspace Audit Trail
          </h1>
          <p className="text-sm text-slate-400">
            Immutable log of all administrative actions, connections, member mutations, and security events.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchLogs}
          disabled={isLoading}
          className="flex items-center space-x-2 border-slate-800"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </Button>
      </div>

      <Card className="border-slate-800 bg-slate-900/60 backdrop-blur-md">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <History className="h-5 w-5 text-indigo-400" />
              <CardTitle className="text-base">Recorded Events ({total})</CardTitle>
            </div>
            <span className="text-xs text-slate-400">Zero-Credential Sanitized</span>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-slate-400">
                    No audit records logged yet.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs text-slate-400 whitespace-nowrap">
                      {formatDate(log.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getActionBadgeVariant(log.action)} className="text-[10px] font-mono">
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {log.user ? (
                        <span className="text-slate-200 font-medium">
                          {log.user.name || log.user.email}
                        </span>
                      ) : (
                        <span className="text-slate-500 italic">System / Anonymous</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-slate-300 font-mono">
                      {log.resource}
                    </TableCell>
                    <TableCell className="text-xs text-slate-400 max-w-xs truncate font-mono">
                      {log.details ? JSON.stringify(log.details) : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
