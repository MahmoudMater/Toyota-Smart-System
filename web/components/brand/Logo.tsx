"use client";

import Image from "next/image";
import { cn } from "@/lib/cn";

type LogoProps = {
  className?: string;
  size?: number;
  showText?: boolean;
};

export function Logo({ className, size = 48, showText = true }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        className="relative shrink-0 overflow-hidden rounded-full ring-1 ring-[var(--border)]"
        style={{ width: size, height: size }}
      >
        <Image
          src="/alsayer.jpeg"
          alt="Al Sayer"
          fill
          className="object-cover"
          priority
        />
      </div>
      {showText && (
        <div className="leading-tight">
          <div className="font-[family-name:var(--font-space-grotesk)] text-sm font-semibold tracking-wide text-[var(--accent-bright)]">
            ALSAYER
          </div>
          <div className="text-xs text-[var(--muted)]">Hayyak · Smart Gate</div>
        </div>
      )}
    </div>
  );
}
