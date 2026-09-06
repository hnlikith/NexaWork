/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { getIronSession, IronSession } from "iron-session";
import { cookies } from "next/headers";
import { Role } from "@/types/database.types";

export interface SessionData {
  userId: string;
  email: string;
  role: Role;
}

const sessionOptions = {
  cookieName: "np_session",
  password: process.env.SESSION_SECRET ?? "fallback-session-secret-change-in-production-32chars",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}
