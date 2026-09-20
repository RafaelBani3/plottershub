import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth/auth-provider";
import { WorkspaceProvider } from "@/components/workspace/workspace-provider";

export const metadata: Metadata = {
  title: "Plottershub — Social Media Intelligence & Operations",
  description:
    "Professional social media management and analytics platform for TikTok, Instagram and YouTube.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground font-sans antialiased selection:bg-zinc-900 selection:text-white">
        <AuthProvider>
          <WorkspaceProvider>
            {children}
          </WorkspaceProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
