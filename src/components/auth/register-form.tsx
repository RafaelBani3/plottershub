"use client";

import * as React from "react";
import Link from "next/link";
import { useAuth } from "./auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Layers, ShieldAlert, ArrowRight } from "lucide-react";

export function RegisterForm() {
  const { register } = useAuth();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      setError(null);
      await register(email, password, name);
    } catch (err: any) {
      setError(err.message || "Failed to register account");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-sm border-border-strong bg-surface shadow-md">
      <CardHeader className="space-y-2 text-center p-5 pb-3">
        <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-md border border-border-strong bg-elevated text-foreground">
          <Layers className="h-4 w-4" />
        </div>
        <CardTitle className="text-base font-semibold tracking-tight text-foreground">
          Create Workspace Account
        </CardTitle>
        <CardDescription className="text-xs text-muted-foreground">
          Initialize social media analytics workspaces
        </CardDescription>
      </CardHeader>

      <CardContent className="p-5 pt-2">
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <div className="p-2.5 rounded-md border border-negative/25 bg-negative/10 text-negative text-xs flex items-center space-x-2">
              <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="name" className="text-xs text-muted-foreground">Full Name</Label>
            <Input
              id="name"
              type="text"
              placeholder="Alex Creator"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="email" className="text-xs text-muted-foreground">Work Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="alex@agency.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="password" className="text-xs text-muted-foreground">Password (min 8 characters)</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          <Button
            type="submit"
            className="w-full mt-2 h-9 text-xs font-medium flex items-center justify-center"
            disabled={isLoading}
          >
            <span>{isLoading ? "Creating Account..." : "Create Account & Workspace"}</span>
            {!isLoading && <ArrowRight className="h-3.5 w-3.5 ml-1" />}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="flex justify-center border-t border-border-subtle p-3">
        <p className="text-[11px] text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-foreground hover:underline"
          >
            Sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
