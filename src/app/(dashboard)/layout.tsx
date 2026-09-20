import * as React from "react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { MobileNavProvider } from "@/components/layout/mobile-nav-context";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MobileNavProvider>
      <div className="min-h-screen bg-background text-foreground flex">
        {/* Sidebar */}
        <AppSidebar />

        {/* Main Container */}
        <div className="flex-1 flex flex-col pl-0 lg:pl-60 min-w-0 transition-[padding] duration-200">
          <AppHeader />
          <main className="flex-1 p-3 sm:p-5 lg:p-6 max-w-7xl w-full mx-auto min-w-0">
            {children}
          </main>
        </div>
      </div>
    </MobileNavProvider>
  );
}
