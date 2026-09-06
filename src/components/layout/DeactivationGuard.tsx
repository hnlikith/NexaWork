"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useAuth } from "@/components/layout/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Lock, LogOut, ShieldAlert, Clock, Shield, AlertCircle } from "lucide-react";

export function DeactivationGuard({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();

  // If user is logged in but is_active is false, render the frozen screen overlay.
  if (user && user.is_active === false) {
    const deactivator = (user as any).deactivator;
    const deactivatedAt = (user as any).deactivated_at;

    const formattedDate = deactivatedAt
      ? new Date(deactivatedAt).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "Recently";

    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-50/70 dark:bg-slate-950/70 backdrop-blur-md p-4 font-sans text-foreground transition-all duration-300">
        {/* Decorative subtle ambient lights */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-40 dark:opacity-20">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full bg-rose-400/20 blur-[100px]" />
          <div className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full bg-amber-300/20 blur-[100px]" />
        </div>

        <Card className="relative w-full max-w-xl border border-border/80 shadow-2xl bg-card text-card-foreground p-2 md:p-4 animate-in fade-in-50 zoom-in-95 duration-300 rounded-xl">
          <CardHeader className="text-center pb-2">
            {/* Warning Shield Badge */}
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/10 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 shadow-inner">
              <ShieldAlert className="h-7 w-7 animate-pulse" />
            </div>

            <CardTitle className="text-xl font-bold tracking-tight text-foreground">
              Administrative Access Revocation
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-2 max-w-md mx-auto leading-relaxed">
              This credential set has been suspended{deactivator ? ` by ${deactivator.name}` : " administratively"}. Active sessions are terminated and portal access is currently restricted.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            {/* Security Protocol Warning */}
            <Alert variant="destructive" className="border-rose-500/20 bg-rose-500/5 dark:bg-rose-500/10 text-rose-800 dark:text-rose-400">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle className="font-semibold text-xs leading-none">Security Protocol Active</AlertTitle>
              <AlertDescription className="text-[11px] mt-1 leading-normal text-rose-700 dark:text-rose-300">
                All login attempts and network interactions from this identity source are logged. Please contact the security desk for reinstatement inquiries.
              </AlertDescription>
            </Alert>

            {/* Lockout Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Card 1: Affected Account Details */}
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Affected Account</span>
                  <Badge variant="destructive" className="text-[9px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full">
                    Suspended
                  </Badge>
                </div>
                <Separator className="bg-border/50" />
                
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar className="h-7 w-7 border border-border">
                      <AvatarFallback className="text-[10px] font-bold bg-rose-500/10 text-rose-700 dark:bg-rose-500/25 dark:text-rose-400">
                        {user.name ? user.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2) : "US"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-foreground truncate">{user.name}</p>
                      <p className="text-[9px] text-muted-foreground truncate">{user.email}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-y-1 text-[10px] pt-0.5 border-t border-border/30">
                    <span className="text-muted-foreground">Employee ID:</span>
                    <span className="font-mono text-foreground text-right">{user.employee_id || "N/A"}</span>
                    <span className="text-muted-foreground">Role Scope:</span>
                    <span className="font-medium text-foreground text-right capitalize truncate">{user.role?.replace("_", " ")}</span>
                    <span className="text-muted-foreground">Frozen On:</span>
                    <span className="font-medium text-foreground text-right truncate">{formattedDate}</span>
                  </div>
                </div>
              </div>

              {/* Card 2: Suspending Administrator */}
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Authorized By</span>
                  <span className="text-[10px] font-semibold tracking-wide uppercase text-muted-foreground font-mono">Admin Ops</span>
                </div>
                <Separator className="bg-border/50" />
                
                {deactivator ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar className="h-7 w-7 border border-border">
                        <AvatarFallback className="text-[10px] font-bold bg-rose-500/10 text-rose-700 dark:bg-rose-500/25 dark:text-rose-400">
                          {deactivator.name ? deactivator.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2) : "OP"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-foreground truncate">{deactivator.name}</p>
                        <p className="text-[9px] text-muted-foreground truncate">{deactivator.email}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-y-1 text-[10px] pt-0.5 border-t border-border/30">
                      <span className="text-muted-foreground">Staff ID:</span>
                      <span className="font-mono text-foreground text-right">{deactivator.employee_id || "N/A"}</span>
                      <span className="text-muted-foreground">Role Scope:</span>
                      <span className="font-medium text-foreground text-right capitalize truncate">{deactivator.role?.replace("_", " ")}</span>
                      <span className="text-muted-foreground">Action Mode:</span>
                      <span className="font-medium text-foreground text-right">Manual Override</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col justify-center items-center h-[76px] text-center">
                    <Shield className="h-4 w-4 text-muted-foreground mb-1" />
                    <p className="text-[11px] font-medium text-foreground">System Audit Action</p>
                    <p className="text-[9px] text-muted-foreground">Automatic Account Lockdown</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-3 pt-2">
            <Button
              onClick={() => logout()}
              variant="destructive"
              className="w-full h-10 bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800 text-white font-semibold rounded-lg shadow-sm flex items-center justify-center gap-2 transition-colors uppercase tracking-wider text-xs"
            >
              <LogOut className="h-4 w-4" /> Sign Out & Exit Session
            </Button>
            <p className="text-[10px] text-muted-foreground text-center max-w-sm leading-relaxed">
              If you require reinstatement or need to appeal this decision, please reach out to the platform security desk.
            </p>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
