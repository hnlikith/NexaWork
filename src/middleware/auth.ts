/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession, SessionData } from "@/lib/session";
import { createClient } from "@/lib/supabaseServer";

import { cache } from "react";

import { Role } from "@/types/database.types";

export const authenticate = cache(async (): Promise<SessionData> => {
  try {
    // 1. Try Supabase Session (Primary)
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (user && !authErr) {
      const { data: emp, error: empErr } = await supabase
        .from("employees")
        .select("role, email")
        .eq("id", user.id)
        .single();

      if (emp && !empErr) {
        return { 
          userId: user.id, 
          email: emp.email, 
          role: emp.role as any 
        };
      }
    } else if (authErr) {
      console.warn("[Auth] Supabase auth check failed:", authErr.message);
    }

    // 2. Try Iron Session (Legacy/Fallback)
    const session = await getSession();
    if (session.userId) {
      return { userId: session.userId, email: session.email, role: session.role };
    }

    console.warn("[Auth] No valid session found in Supabase or Iron Session");
    const error = new Error("Authentication required");
    (error as any).status = 401;
    throw error;
  } catch (err: any) {
    if (err.status) throw err;
    console.error("[Auth] Exception during authentication:", err.message);
    const error = new Error(err.message || "Authentication failed");
    (error as any).status = 401;
    throw error;
  }
});

export async function requireRole(
  _req: NextRequest,
  ...roles: Role[]
): Promise<SessionData> {
  const payload = await authenticate();
  if (!roles.includes(payload.role)) {
    const error = new Error(`Access denied. Required role: ${roles.join(" or ")}`);
    (error as any).status = 403;
    throw error;
  }
  return payload;
}

export function withAuth(
  handler: (req: NextRequest, user: SessionData) => Promise<NextResponse>,
  ...roles: Role[]
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      const user = roles.length > 0 ? await requireRole(req, ...roles) : await authenticate();
      return await handler(req, user);
    } catch (err: any) {
      const message = err.message || "Unauthorized";
      const status = err.status || 401;
      return NextResponse.json({ error: message }, { status });
    }
  };
}

export function apiError(message: string, status = 500): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function apiSuccess<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}
