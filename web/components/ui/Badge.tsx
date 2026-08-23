import { cn } from "@/lib/cn";

type BadgeProps = {
  status: string;
  className?: string;
};

export function Badge({ status, className }: BadgeProps) {
  const normalized = status.toLowerCase().replace(/\s+/g, "-");
  return (
    <span className={cn("badge", `badge-${normalized}`, className)}>
      {status}
    </span>
  );
}
