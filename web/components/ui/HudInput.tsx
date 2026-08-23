import { cn } from "@/lib/cn";

type HudInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};

export function HudInput({ label, id, className, ...props }: HudInputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className={className}>
      {label ? (
        <label htmlFor={inputId} className="hud-label">
          {label}
        </label>
      ) : null}
      <input id={inputId} className="hud-input" {...props} />
    </div>
  );
}

type HudTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
};

export function HudTextarea({ label, id, className, ...props }: HudTextareaProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className={className}>
      {label ? (
        <label htmlFor={inputId} className="hud-label">
          {label}
        </label>
      ) : null}
      <textarea id={inputId} className="hud-input min-h-[88px] resize-y" {...props} />
    </div>
  );
}
