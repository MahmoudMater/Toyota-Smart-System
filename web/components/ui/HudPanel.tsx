import { cn } from "@/lib/cn";

type HudPanelProps = {
  title?: string;
  children: React.ReactNode;
  className?: string;
};

export function HudPanel({ title, children, className }: HudPanelProps) {
  return (
    <section className={cn("hud-panel", className)}>
      {title ? <h2 className="hud-panel-title">{title}</h2> : null}
      {children}
    </section>
  );
}
