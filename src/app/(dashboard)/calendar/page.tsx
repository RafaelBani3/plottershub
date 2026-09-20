"use client";

import * as React from "react";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { CalendarDays, Sparkles } from "lucide-react";

export default function CalendarPage() {
  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Publishing Calendar
        </h1>
        <p className="text-sm text-slate-400">
          Visual schedule of upcoming publications, drafts, and multi-channel queues.
        </p>
      </div>

      <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-sm flex items-center space-x-3">
        <Sparkles className="h-5 w-5 text-indigo-400 shrink-0" />
        <div>
          <span className="font-semibold text-white">Phase 9 Milestone:</span> Drag-and-drop schedule management and async publishing queues.
        </div>
      </div>

      <Card className="border-slate-800 bg-slate-900/40 border-dashed text-center py-16">
        <CardContent className="space-y-3">
          <div className="h-12 w-12 rounded-2xl bg-slate-800/80 text-slate-400 flex items-center justify-center mx-auto">
            <CalendarDays className="h-6 w-6" />
          </div>
          <CardTitle className="text-lg font-semibold text-slate-200">Calendar View Ready for Phase 9</CardTitle>
          <CardDescription className="text-sm text-slate-400 max-w-md mx-auto">
            Interactive publishing calendar with timezone-aware scheduling will be configured once the core publishing engine is in place.
          </CardDescription>
        </CardContent>
      </Card>
    </div>
  );
}
