"use client";

import React from "react";

interface GradientIconProps {
  icon: React.ElementType;
  size?: "sm" | "md" | "lg";
}

export function GradientIcon({ icon: Icon, size = "md" }: GradientIconProps) {
  const sizeClasses = {
    sm: "w-8 h-8",
    md: "w-12 h-12",
    lg: "w-16 h-16",
  };

  const iconSizeClasses = {
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-8 h-8",
  };

  return (
    <div className={`flex-shrink-0 ${sizeClasses[size]} rounded-full bg-brand-yellow/10 flex items-center justify-center`}>
      <svg width="0" height="0" className="absolute">
        <defs>
          <linearGradient id="icon-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffde59" />
            <stop offset="100%" stopColor="#ff914d" />
          </linearGradient>
        </defs>
      </svg>
      <Icon
        className={iconSizeClasses[size]}
        style={{ stroke: "url(#icon-gradient)" }}
      />
    </div>
  );
}