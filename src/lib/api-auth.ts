/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { getSession } from "@/lib/session";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Unified API auth helper.
 * Priority: iron-session (np_session cookie) → Supabase JWT cookie.
 * Returns the authenticated userId (UUID) or null.
 */
export async function getApiUserId(): Promise<string | null> {
  // 1. Try iron-session (set during email/password login)
  try {
    const session = await getSession();
    if (session?.userId) return session.userId;
  } catch {}

  // 2. Fallback: verify Supabase JWT from browser cookie
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {}
          },
        },
      }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) return user.id;
  } catch {}

  return null;
}
