"use client";

import React from "react";

export function GradientIcon({ icon: Icon }: { icon: React.ElementType }) {
  return (
    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-brand-amber/10 flex items-center justify-center">
      <svg width="0" height="0" className="absolute">
        <defs>
          <linearGradient id="icon-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#EF4444" />
          </linearGradient>
        </defs>
      </svg>
      <Icon
        className="w-6 h-6"
        style={{ stroke: "url(#icon-gradient)" }}
      />
    </div>
  );
}