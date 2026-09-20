"use client";

import * as React from "react";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { FileSpreadsheet, Sparkles } from "lucide-react";

export default function ReportsPage() {
  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Executive Reports & Exports
        </h1>
        <p className="text-sm text-slate-400">
          Generate branded PDF, CSV, and XLSX performance summaries for stakeholders.
        </p>
      </div>

      <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-sm flex items-center space-x-3">
        <Sparkles className="h-5 w-5 text-indigo-400 shrink-0" />
        <div>
          <span className="font-semibold text-white">Phase 11 Milestone:</span> Automated weekly/monthly executive export engine.
        </div>
      </div>

      <Card className="border-slate-800 bg-slate-900/40 border-dashed text-center py-16">
        <CardContent className="space-y-3">
          <div className="h-12 w-12 rounded-2xl bg-slate-800/80 text-slate-400 flex items-center justify-center mx-auto">
            <FileSpreadsheet className="h-6 w-6" />
          </div>
          <CardTitle className="text-lg font-semibold text-slate-200">Report Generator Scheduled for Phase 11</CardTitle>
          <CardDescription className="text-sm text-slate-400 max-w-md mx-auto">
            Multi-platform report generation with AI executive summaries and data exports.
          </CardDescription>
        </CardContent>
      </Card>
    </div>
  );
}
