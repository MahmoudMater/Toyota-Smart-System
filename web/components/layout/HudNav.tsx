"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House,
  Terminal,
  ListBullets,
  QrCode,
  Microphone,
} from "@phosphor-icons/react";
import { Logo } from "@/components/brand/Logo";
import { cn } from "@/lib/cn";

const links = [
  { href: "/", label: "Kiosk", icon: House },
  { href: "/console", label: "Voice Console", icon: Microphone },
  { href: "/console/qr", label: "QR Console", icon: Terminal },
  { href: "/checkin", label: "Check-in", icon: QrCode },
  { href: "/logs", label: "Logs", icon: ListBullets },
];

export function HudNav() {
  const pathname = usePathname();

  return (
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
      <Logo size={40} />
      <nav className="flex flex-wrap gap-2">
        {links.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/console"
              ? pathname === "/console"
              : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "glow-btn glow-btn-secondary flex items-center gap-2 px-4 py-2 text-sm",
                active && "border-[var(--accent)] text-[var(--accent-bright)]",
              )}
            >
              <Icon size={18} weight="regular" aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
