"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Clock, Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface TimePickerProps {
  value: string; // HH:MM:SS format
  onChange: (time: string) => void;
  disabled?: boolean;
}

export function TimePicker({ value, onChange, disabled = false }: TimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hours, setHours] = useState("09");
  const [minutes, setMinutes] = useState("00");
  const [period, setPeriod] = useState("AM");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Parse incoming value
  useEffect(() => {
    if (value) {
      const [h, m] = value.split(":").slice(0, 2);
      const hNum = parseInt(h);
      const isPM = hNum >= 12;
      const display12h = hNum === 0 ? 12 : hNum > 12 ? hNum - 12 : hNum;

      setHours(String(display12h).padStart(2, "0"));
      setMinutes(m || "00");
      setPeriod(isPM ? "PM" : "AM");
    }
  }, [value]);

  // Convert 12-hour to 24-hour and emit
  const handleTimeChange = (h: string, m: string, p: string) => {
    let hour24 = parseInt(h);
    if (p === "PM" && hour24 !== 12) hour24 += 12;
    if (p === "AM" && hour24 === 12) hour24 = 0;

    const formattedTime = `${String(hour24).padStart(2, "0")}:${m}:00`;
    onChange(formattedTime);
  };

  const adjustHour = (delta: number) => {
    let newHour = parseInt(hours) + delta;
    if (newHour > 12) newHour = 1;
    if (newHour < 1) newHour = 12;
    const newHourStr = String(newHour).padStart(2, "0");
    setHours(newHourStr);
    handleTimeChange(newHourStr, minutes, period);
  };

  const adjustMinute = (delta: number) => {
    let newMinute = parseInt(minutes) + delta;
    if (newMinute > 59) newMinute = 0;
    if (newMinute < 0) newMinute = 59;
    const newMinuteStr = String(newMinute).padStart(2, "0");
    setMinutes(newMinuteStr);
    handleTimeChange(hours, newMinuteStr, period);
  };

  const handlePeriodChange = (p: string) => {
    setPeriod(p);
    handleTimeChange(hours, minutes, p);
  };

  const setToCurrentTime = () => {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const isPM = h >= 12;
    const display12h = h === 0 ? 12 : h > 12 ? h - 12 : h;

    setHours(String(display12h).padStart(2, "0"));
    setMinutes(String(m).padStart(2, "0"));
    setPeriod(isPM ? "PM" : "AM");
    handleTimeChange(String(display12h).padStart(2, "0"), String(m).padStart(2, "0"), isPM ? "PM" : "AM");
  };

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClick = (e: Event) => {
      const target = e.target as HTMLElement;
      if (dropdownRef.current && target && !dropdownRef.current.contains(target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [isOpen]);

  const displayTime = `${hours}:${minutes} ${period}`;

  return (
    <div className="w-full">
      <div ref={dropdownRef} className="relative">
        {/* Main Time Display Button - Compact */}
        <button
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className={cn(
            "w-full h-11 px-3 rounded-lg border transition-all flex items-center justify-between",
            "tabular-nums text-sm font-semibold",
            disabled
              ? "bg-theme-page/50 border-theme-border/50 text-theme-muted cursor-not-allowed"
              : "bg-theme-page border-theme-border hover:border-theme-primary/50 text-theme-fg",
            isOpen && "border-theme-primary bg-theme-raised shadow-lg ring-2 ring-theme-primary/20"
          )}
        >
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-theme-muted" />
            <span>{displayTime}</span>
          </div>
          <ChevronDown
            size={16}
            className={cn(
              "text-theme-muted transition-transform duration-300",
              isOpen && "rotate-180"
            )}
          />
        </button>

        {/* Compact Dropdown Menu */}
        {isOpen && !disabled && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-theme-surface border border-theme-border rounded-xl shadow-xl overflow-hidden z-[10001]">
            {/* Header */}
            <div className="bg-gradient-to-r from-theme-primary/10 to-theme-primary/5 px-4 py-3 border-b border-theme-border flex items-center justify-between">
              <p className="text-xs font-bold text-theme-muted uppercase">Time</p>
              <button
                onClick={setToCurrentTime}
                title="Set to current time"
                className="p-1.5 rounded-md bg-theme-primary/20 hover:bg-theme-primary/30 text-theme-primary transition-all"
              >
                <Clock size={14} />
              </button>
            </div>

            {/* Compact Time Controls */}
            <div className="p-4 space-y-3">
              {/* Hour Control */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-theme-muted w-12">Hour</span>
                <div className="flex items-center gap-2 flex-1">
                  <button
                    onClick={() => adjustHour(-1)}
                    className="p-1.5 rounded-md bg-theme-page hover:bg-theme-raised border border-theme-border text-theme-fg transition-all"
                  >
                    <Minus size={14} />
                  </button>
                  <div className="flex-1 h-9 flex items-center justify-center bg-gradient-to-br from-theme-primary/10 to-theme-primary/5 rounded-lg border border-theme-primary">
                    <span className="text-xl font-bold text-theme-fg">{hours}</span>
                  </div>
                  <button
                    onClick={() => adjustHour(1)}
                    className="p-1.5 rounded-md bg-theme-page hover:bg-theme-raised border border-theme-border text-theme-fg transition-all"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              {/* Minute Control */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-theme-muted w-12">Min</span>
                <div className="flex items-center gap-2 flex-1">
                  <button
                    onClick={() => adjustMinute(-1)}
                    className="p-1.5 rounded-md bg-theme-page hover:bg-theme-raised border border-theme-border text-theme-fg transition-all"
                  >
                    <Minus size={14} />
                  </button>
                  <div className="flex-1 h-9 flex items-center justify-center bg-gradient-to-br from-theme-primary/10 to-theme-primary/5 rounded-lg border border-theme-primary">
                    <span className="text-xl font-bold text-theme-fg">{minutes}</span>
                  </div>
                  <button
                    onClick={() => adjustMinute(1)}
                    className="p-1.5 rounded-md bg-theme-page hover:bg-theme-raised border border-theme-border text-theme-fg transition-all"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            </div>

            {/* AM/PM Toggle */}
            <div className="border-t border-theme-border px-4 py-2 flex gap-2">
              {["AM", "PM"].map((p) => (
                <button
                  key={p}
                  onClick={() => handlePeriodChange(p)}
                  className={cn(
                    "flex-1 h-8 rounded-md font-bold text-xs transition-all",
                    period === p
                      ? "bg-theme-primary text-theme-surface shadow-sm"
                      : "bg-theme-page text-theme-muted hover:bg-theme-raised border border-theme-border"
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
