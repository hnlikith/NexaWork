"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

function initials(name?: string | null): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/**
 * Candidate display picture, sourced from the uploaded profile photo (falls back
 * to the verification selfie, then to initials). Used everywhere onboarding shows
 * a candidate — list, builder, pickers — so the DP stays consistent.
 */
export function CandidateAvatar({
  email,
  name,
  className,
  fallbackClassName,
}: {
  email?: string | null;
  name?: string | null;
  className?: string;
  fallbackClassName?: string;
}) {
  return (
    <Avatar className={className}>
      {email ? <AvatarImage src={`/api/onboarding/photo?email=${encodeURIComponent(email)}`} alt={name || ""} /> : null}
      <AvatarFallback className={fallbackClassName}>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
