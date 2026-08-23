"use client";

import { GlowButton } from "@/components/ui/GlowButton";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "✓"] as const;

type KeypadProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export function Keypad({ value, onChange, onSubmit }: KeypadProps) {
  return (
    <div className="mt-3 grid max-w-[220px] grid-cols-3 gap-2">
      {KEYS.map((key) => (
        <GlowButton
          key={key}
          variant="secondary"
          className="px-0"
          onClick={() => {
            if (key === "⌫") onChange(value.slice(0, -1));
            else if (key === "✓") onSubmit();
            else onChange(value + key);
          }}
        >
          {key}
        </GlowButton>
      ))}
    </div>
  );
}
