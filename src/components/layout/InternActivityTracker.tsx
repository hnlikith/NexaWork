"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { useEffect, useRef } from "react";
import { isPayrollInternOnly } from "@/lib/payroll-access";
import { pathSection, getPresenceSessionId } from "@/lib/log-ui";
import { useAuth } from "./AuthProvider";

export function InternActivityTracker() {
  const { user } = useAuth();
  const lastActiveRef = useRef<number>(Date.now());
  const isInactiveRef = useRef<boolean>(false);

  useEffect(() => {
    if (!user) return;

    const isIntern = isPayrollInternOnly(user.email);
    const prefix = isIntern ? "intern" : "employee";

    const getSection = () => {
      if (isIntern) return "Internship";
      const path = typeof window !== "undefined" ? window.location.pathname : "";
      return pathSection(path);
    };

    const logActivity = (action: string, summary: string) => {
      fetch("/api/interns/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, summary, section: getSection() }),
      }).catch(() => {});
    };

    // Mark active immediately on mount
    fetch("/api/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "available", device_id: getPresenceSessionId() }),
    }).catch(() => {});

    logActivity(`${prefix}.active`, "Opened portal / active in workspace");

    // 1. Setup global click tracker
    const handleClick = (e: MouseEvent) => {
      resetIdleTimer();
      const target = e.target as HTMLElement;
      
      const clickable = target.closest("button, a, [role='button'], input[type='checkbox'], input[type='radio'], select");
      if (!clickable) return;

      const tag = clickable.tagName.toLowerCase();
      let text = clickable.textContent?.trim() || "";
      const id = clickable.id;
      const name = clickable.getAttribute("name") || "";
      const title = clickable.getAttribute("title") || clickable.getAttribute("aria-label") || "";

      text = text.replace(/\s+/g, " ");
      if (text.length > 60) text = text.slice(0, 57) + "...";

      const tr = clickable.closest("tr");
      let internName = "";
      if (tr) {
        const td = tr.querySelector("td");
        if (td) {
          internName = td.querySelector(".font-medium")?.textContent?.trim() || td.textContent?.trim() || "";
          internName = internName.replace(/\s+/g, " ").trim();
        }
      }

      let summary = "";
      if (internName) {
        summary = `Clicked "${text || id || name || "action"}" for ${internName}`;
      } else {
        if (tag === "a") {
          summary = `Clicked link: "${text || title || id || "Navigation"}"`;
        } else {
          summary = `Clicked button: "${text || title || id || name || "action"}"`;
        }
      }

      logActivity(`${prefix}.click`, summary);
    };

    // 2. Setup input blur/change tracker
    const handleInputBlur = (e: FocusEvent) => {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement;
      if (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA") return;
      
      const value = target.value;
      const placeholder = target.placeholder || target.getAttribute("name") || target.id || "input";

      const tr = target.closest("tr");
      let internName = "";
      if (tr) {
        const td = tr.querySelector("td");
        if (td) {
          internName = td.querySelector(".font-medium")?.textContent?.trim() || td.textContent?.trim() || "";
          internName = internName.replace(/\s+/g, " ").trim();
        }
      }

      let summary = "";
      if (internName) {
        summary = `Updated field "${placeholder}" for ${internName} to "${value}"`;
      } else {
        summary = `Updated field "${placeholder}" to "${value}"`;
      }

      logActivity(`${prefix}.input`, summary);
    };

    const handleSelectChange = (e: Event) => {
      const target = e.target as HTMLSelectElement;
      if (target.tagName !== "SELECT") return;

      const value = target.options[target.selectedIndex]?.text || target.value;
      const name = target.getAttribute("name") || target.id || "dropdown";

      logActivity(`${prefix}.select`, `Changed dropdown "${name}" selection to "${value}"`);
    };

    // 3. Setup idle/inactivity detector
    const IDLE_TIMEOUT = 120000; // 2 minutes
    
    const resetIdleTimer = () => {
      if (isInactiveRef.current) {
        const durationMs = Date.now() - lastActiveRef.current;
        const durationStr = formatDuration(durationMs);
        logActivity(`${prefix}.active`, `Resumed activity (was inactive for ${durationStr})`);
        
        fetch("/api/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "available", device_id: getPresenceSessionId() }),
        }).catch(() => {});
        
        isInactiveRef.current = false;
      }
      lastActiveRef.current = Date.now();
    };

    const activityEvents = ["mousemove", "mousedown", "keypress", "scroll", "touchstart"];
    activityEvents.forEach((ev) => window.addEventListener(ev, resetIdleTimer, { passive: true }));

    document.addEventListener("click", handleClick, true);
    document.addEventListener("blur", handleInputBlur, true);
    document.addEventListener("change", handleSelectChange, true);

    const checkIdle = setInterval(() => {
      const elapsed = Date.now() - lastActiveRef.current;
      if (elapsed >= IDLE_TIMEOUT && !isInactiveRef.current) {
        isInactiveRef.current = true;
        logActivity(`${prefix}.became_inactive`, "Became inactive");
        
        fetch("/api/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "idle", device_id: getPresenceSessionId() }),
        }).catch(() => {});
      }
    }, 10000);

    return () => {
      activityEvents.forEach((ev) => window.removeEventListener(ev, resetIdleTimer));
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("blur", handleInputBlur, true);
      document.removeEventListener("change", handleSelectChange, true);
      clearInterval(checkIdle);
    };
  }, [user]);

  return null;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
