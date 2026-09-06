"use client";

/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */


import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect } from "react";

interface SlideOverProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  width?: string;
}

export function SlideOver({ 
  isOpen, 
  onClose, 
  title, 
  subtitle, 
  children, 
  width = "max-w-2xl" 
}: SlideOverProps) {
  
  // Close on Escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" 
            />

            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
              <motion.div 
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className={cn("pointer-events-auto w-screen", width)}
              >
                <div className="flex h-full flex-col overflow-y-scroll bg-theme-surface shadow-2xl border-l border-theme-border">
                  {/* Header */}
                  <div className="px-8 py-6 bg-theme-raised/5 border-b border-theme-border">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <h2 className="text-xl font-black text-theme-fg uppercase tracking-tight">{title}</h2>
                        {subtitle && (
                          <p className="text-xs font-medium text-theme-muted">{subtitle}</p>
                        )}
                      </div>
                      <div className="ml-3 flex h-7 items-center">
                        <button
                          type="button"
                          onClick={onClose}
                          className="rounded-full h-8 w-8 flex items-center justify-center hover:bg-theme-raised text-theme-muted hover:text-theme-fg transition-all"
                        >
                          <X size={20} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="relative flex-1 p-8 scrollbar-hide">
                    {children}
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
