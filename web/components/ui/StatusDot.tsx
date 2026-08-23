import { cn } from "@/lib/cn";

type StatusDotProps = {
  connected: boolean;
  label: string;
  className?: string;
};

export function StatusDot({ connected, label, className }: StatusDotProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full bg-[var(--surface-strong)] px-3 py-1 text-sm text-[var(--muted)]",
        className,
      )}
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          connected ? "bg-[var(--ok)]" : "bg-[var(--danger)]",
        )}
        aria-hidden
      />
      {label}
    </span>
  );
}
