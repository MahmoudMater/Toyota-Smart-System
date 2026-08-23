import { cn } from "@/lib/cn";

type GlowButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ok" | "danger";
};

export function GlowButton({
  variant = "primary",
  className,
  children,
  ...props
}: GlowButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "glow-btn",
        variant === "primary" && "glow-btn-primary",
        variant === "secondary" && "glow-btn-secondary",
        variant === "ok" && "glow-btn-ok",
        variant === "danger" && "glow-btn-danger",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
