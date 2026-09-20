import * as React from "react";
import Link from "next/link";
import { Youtube, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NoAccountState() {
  return (
    <div className="rounded-md border border-border-subtle bg-surface p-8 text-center text-foreground">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md bg-red-500/10 text-youtube border border-red-500/20">
        <Youtube className="h-5 w-5" aria-hidden="true" />
      </div>
      <h2 className="mt-3 text-base font-semibold text-foreground">No Connected YouTube Channels</h2>
      <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
        To view audience analytics, video performance, and daily channel trends, connect a YouTube channel to this workspace.
      </p>
      <div className="mt-4 flex justify-center">
        <Link href="/social-accounts">
          <Button size="sm" className="bg-youtube text-white hover:bg-red-600 font-medium">
            Connect YouTube Channel
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
