import Link from "next/link";
import { Layers, ArrowRight, Shield, BarChart3, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between">
      {/* Navigation */}
      <header className="flex h-14 items-center justify-between px-4 sm:px-8 max-w-6xl mx-auto w-full border-b border-border-subtle">
        <div className="flex items-center space-x-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded border border-border-strong bg-elevated text-foreground">
            <Layers className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-foreground">
            Plottershub
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <Link href="/login">
            <Button variant="ghost" size="sm" className="text-xs">
              Sign In
            </Button>
          </Link>
          <Link href="/register">
            <Button size="sm" className="text-xs">
              Get Started
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-4xl mx-auto px-4 py-12 sm:py-16 text-center flex flex-col items-center">
        <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded border border-border-strong bg-surface text-muted-foreground text-xs font-mono mb-6">
          <span>Social Media Analytics Workspace</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-foreground leading-tight mb-4">
          Professional Social Media <br className="hidden sm:inline" />
          Analytics Workspace
        </h1>

        <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto mb-8 leading-relaxed">
          Centralize official multi-platform connections, historical metric snapshot curves,
          idempotent publishing workflows, and diagnostic intelligence in multi-tenant workspaces.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <Link href="/register">
            <Button size="lg" className="h-9 px-5 text-xs flex items-center space-x-1.5 font-medium">
              <span>Launch Workspace</span>
              <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="outline" className="h-9 px-5 text-xs">
              Existing Account
            </Button>
          </Link>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-12 text-left w-full">
          <div className="p-4 rounded-md border border-border-subtle bg-surface">
            <div className="h-8 w-8 rounded border border-border-subtle bg-elevated text-foreground flex items-center justify-center mb-3">
              <Shield className="h-4 w-4 text-positive" />
            </div>
            <h3 className="font-semibold text-foreground text-xs mb-1">Server-Side Security</h3>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              AES-256-GCM token encryption, zero client exposure, and strict workspace authorization.
            </p>
          </div>

          <div className="p-4 rounded-md border border-border-subtle bg-surface">
            <div className="h-8 w-8 rounded border border-border-subtle bg-elevated text-foreground flex items-center justify-center mb-3">
              <BarChart3 className="h-4 w-4 text-foreground" />
            </div>
            <h3 className="font-semibold text-foreground text-xs mb-1">Snapshot Analytics</h3>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Preserve complete metric histories without data overwrite. Nullable metrics policy preserves truth.
            </p>
          </div>

          <div className="p-4 rounded-md border border-border-subtle bg-surface">
            <div className="h-8 w-8 rounded border border-border-subtle bg-elevated text-foreground flex items-center justify-center mb-3">
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-foreground text-xs mb-1">Multi-Tenant RBAC</h3>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Granular role hierarchies: Owner, Admin, Editor, Analyst, and Viewer permissions.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border-subtle py-4 px-4 text-center text-[11px] text-muted-foreground">
        Plottershub Platform &copy; 2026. Built with Next.js, PostgreSQL, and Prisma.
      </footer>
    </div>
  );
}
